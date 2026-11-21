// The headers and footers the pages draw (docs/specs/034-text-documents/page-layout.md "Headers and footers"): one
// source for each story at each width a page draws it at, made when a page first names it and taken away when none
// does. The sheets draw an empty box for each page's header and footer; each box is painted here with a copy of its
// source's writing, again whenever that writing changes, and left empty while the source is. Each source's height is
// kept for the layout, which lays the pages out again when one changes.
import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState } from '@livedoc/text-documents';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import { refreshPages } from '@/lib/text-document/pagination/pagination-plugin';
import { StorySource } from '@/lib/text-document/text-document-story-sources';

/** A page's header or footer box: the story at its width it draws. */
export const STORY_KEY_ATTRIBUTE = 'data-story-key';

/** Each story at each width the pages draw, by its key. */
export function storiesWanted(
  pages: readonly PageGeometry[] | null,
): Map<string, { story: string; width: number }> {
  const wanted = new Map<string, { story: string; width: number }>();
  for (const page of pages ?? [])
    for (const drawn of [page.header, page.footer])
      if (drawn) wanted.set(drawn.key, { story: drawn.story, width: drawn.width });
  return wanted;
}

/**
 * Gives the callback ref for the sources' hidden place, which the sheets draw inside the pages beside the pages'
 * boxes, so the sources take the pages' type and zoom.
 */
export function useTextDocumentStories(input: {
  readonly view: EditorView | null;
  readonly liveDoc: RefObject<Y.Doc | null>;
  readonly format: TextDocumentFormat;
  /** The pages laid out, or null where none are (pageless, a phone, print layout off). */
  readonly pages: readonly PageGeometry[] | null;
  /** Each source's height by its key, read by the layout. */
  readonly heights: RefObject<Map<string, number>>;
}): (element: HTMLDivElement | null) => void {
  const { view, liveDoc, format, pages, heights } = input;
  const host = useRef<HTMLDivElement | null>(null);
  const sources = useRef(new Map<string, StorySource>());
  const wanted = useMemo(() => storiesWanted(pages), [pages]);

  // Another editor or document: every source goes with the one it was made for, before any is made for the next.
  useLayoutEffect(() => {
    const made = sources.current;
    const held = heights.current;
    return () => {
      for (const source of made.values()) source.destroy();
      made.clear();
      held.clear();
    };
  }, [view, format, heights]);

  useLayoutEffect(() => {
    const doc = liveDoc.current;
    const container = host.current;
    const made = sources.current;
    // Each box drawing `key`, painted with its source's writing, or emptied.
    const paint = (key: string) => {
      const source = made.get(key);
      const boxes = container?.parentElement?.querySelectorAll<HTMLElement>(
        `[${STORY_KEY_ATTRIBUTE}="${CSS.escape(key)}"]`,
      );
      for (const box of boxes ?? [])
        if (source && !source.empty) box.replaceChildren(source.copy());
        else box.replaceChildren();
    };
    let moved = false;
    for (const [key, source] of made)
      if (!wanted.has(key)) {
        source.destroy();
        made.delete(key);
        // A height gone moves the pages it pushed.
        moved = heights.current.delete(key) || moved;
      }
    if (view && doc && container)
      for (const [key, { story, width }] of wanted) {
        if (made.has(key)) continue;
        const source = new StorySource({
          doc,
          format,
          story,
          key,
          width,
          container,
          readFormatting: () => ({
            styles: TextDocumentState.styles(doc, format),
            defaults: TextDocumentState.defaults(doc, format),
          }),
          stylesScope: view.dom.getAttribute('data-text-document-styles'),
          onLaid: (laid) => {
            heights.current.set(key, laid.height);
            paint(key);
            refreshPages(view);
          },
        });
        source.subscribe(() => paint(key));
        made.set(key, source);
      }
    if (moved && view) refreshPages(view);
    // The pages drawn anew: every box painted.
    for (const key of wanted.keys()) paint(key);
  }, [view, liveDoc, format, wanted, heights]);

  return useCallback((element: HTMLDivElement | null) => {
    host.current = element;
  }, []);
}
