// The headers and footers the pages draw (docs/specs/034-text-documents/page-layout.md "Headers and footers"): one
// source for each story at each width a page draws it at, made when a page first names it, or when it is entered to be
// edited, and taken away when none does and it is not held. The sheets draw an empty box for each page's header and
// footer; each box is painted here with a copy of its source's writing, again whenever that writing changes, and left
// empty while the source is. Each source's height is kept for the layout, which lays the pages out again when one
// changes. Footnotes' writing is drawn the same way, at each page's foot or, without pages, under the writing
// (page-layout.md "Footnotes"), each box led by its note's number.
import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState, type HeaderFooterKind } from '@livedoc/text-documents';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import { refreshPages } from '@/lib/text-document/pagination/pagination-plugin';
import { StorySource } from '@/lib/text-document/text-document-story-sources';
import { fillFields, numbersOfBox } from '@/lib/text-document/text-document-fields';
import { NOTE_BOX_NUMBER_ATTRIBUTE, numberNote } from '@/lib/text-document/text-document-footnotes';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';

/** A page's header or footer box: the story at its width it draws. */
export const STORY_KEY_ATTRIBUTE = 'data-story-key';
/** What every box a source paints lies within: the page, its sheets and the writing. */
const STORY_SCOPE = '[data-page-format]';

/** A story at a width, and the kind it is drawn as. */
export type WantedStory = { story: string; width: number; kind: HeaderFooterKind | 'footnote' };

const LABELS: Record<WantedStory['kind'], string> = {
  header: 'Header',
  footer: 'Footer',
  footnote: 'Footnote',
};

/** Each story at each width the pages draw, by its key, and the kind it is drawn as. */
export function storiesWanted(
  pages: readonly PageGeometry[] | null,
  endNotes: readonly PageNote[] = [],
): Map<string, WantedStory> {
  const wanted = new Map<string, WantedStory>();
  for (const page of pages ?? []) {
    for (const kind of ['header', 'footer'] as const) {
      const drawn = page[kind];
      if (drawn) wanted.set(drawn.key, { story: drawn.story, width: drawn.width, kind });
    }
    for (const note of page.notes ?? [])
      wanted.set(note.key, { story: note.story, width: note.width, kind: 'footnote' });
  }
  for (const note of endNotes)
    wanted.set(note.key, { story: note.story, width: note.width, kind: 'footnote' });
  return wanted;
}

export type TextDocumentStories = {
  /** The callback ref for the sources' hidden place. */
  readonly host: (element: HTMLDivElement | null) => void;
  /** The source for a story at a width, made now if there is none; kept while held, whether pages draw it or not. */
  readonly hold: (key: string, wanted: WantedStory) => StorySource | undefined;
  /** Lets a held source go when no page draws it. */
  readonly release: (key: string) => void;
  /** Paints every box drawing `key` again: one drawn anew, as a page's own box back after its story was edited. */
  readonly repaint: (key: string) => void;
};

export function useTextDocumentStories(input: {
  readonly view: EditorView | null;
  readonly liveDoc: RefObject<Y.Doc | null>;
  readonly format: TextDocumentFormat;
  /** The pages laid out, or null where none are (pageless, a phone, print layout off). */
  readonly pages: readonly PageGeometry[] | null;
  /** The notes drawn under the writing where there are no pages. */
  readonly endNotes?: readonly PageNote[];
  /** Each source's height by its key, read by the layout. */
  readonly heights: RefObject<Map<string, number>>;
  /** What a source takes edits with, made once for each source. */
  readonly plugins?: () => Plugin[];
}): TextDocumentStories {
  const { view, liveDoc, format, pages, heights } = input;
  const host = useRef<HTMLDivElement | null>(null);
  const sources = useRef(new Map<string, StorySource>());
  const held = useRef(new Set<string>());
  const { endNotes } = input;
  const wanted = useMemo(() => storiesWanted(pages, endNotes), [pages, endNotes]);
  const drawn = useRef(wanted);
  // What a source is made with, read when one is made: in a layout effect or an event handler.
  const making = useRef({ view, format, plugins: input.plugins });
  useLayoutEffect(() => {
    making.current = { view, format, plugins: input.plugins };
  });

  // Each box drawing `key`, painted with its source's writing, or emptied.
  const paint = useCallback((key: string) => {
    const source = sources.current.get(key);
    // The pages' boxes and the notes under the writing: everything on the page.
    const scope = host.current?.closest(STORY_SCOPE) ?? host.current?.parentElement;
    const boxes = scope?.querySelectorAll<HTMLElement>(
      `[${STORY_KEY_ATTRIBUTE}="${CSS.escape(key)}"]`,
    );
    for (const box of boxes ?? [])
      if (source && !source.empty) {
        const copy = source.copy();
        fillFields(copy, numbersOfBox(box));
        const number = box.getAttribute(NOTE_BOX_NUMBER_ATTRIBUTE);
        if (number) numberNote(copy, number);
        box.replaceChildren(copy);
      } else box.replaceChildren();
  }, []);

  const make = useCallback(
    (key: string, { story, width, kind }: WantedStory): StorySource | undefined => {
      const known = sources.current.get(key);
      if (known) return known;
      const doc = liveDoc.current;
      const container = host.current;
      const { view: body, format: madeFormat, plugins } = making.current;
      if (!body || !doc || !container) return undefined;
      const source = new StorySource({
        doc,
        format: madeFormat,
        story,
        key,
        width,
        container,
        readFormatting: () => ({
          styles: TextDocumentState.styles(doc, madeFormat),
          defaults: TextDocumentState.defaults(doc, madeFormat),
        }),
        stylesScope: body.dom.getAttribute('data-text-document-styles'),
        label: LABELS[kind],
        drawsEmpty: kind === 'footnote',
        plugins: plugins?.() ?? [],
        onLaid: (laid) => {
          heights.current.set(key, laid.height);
          paint(key);
          refreshPages(body);
        },
      });
      source.subscribe(() => paint(key));
      sources.current.set(key, source);
      return source;
    },
    [liveDoc, heights, paint],
  );

  // Another editor or document: every source goes with the one it was made for, before any is made for the next.
  useLayoutEffect(() => {
    const made = sources.current;
    const kept = heights.current;
    const holding = held.current;
    return () => {
      for (const source of made.values()) source.destroy();
      made.clear();
      kept.clear();
      holding.clear();
    };
  }, [view, format, heights]);

  useLayoutEffect(() => {
    drawn.current = wanted;
    const made = sources.current;
    let moved = false;
    for (const [key, source] of made)
      if (!wanted.has(key) && !held.current.has(key)) {
        source.destroy();
        made.delete(key);
        // A height gone moves the pages it pushed.
        moved = heights.current.delete(key) || moved;
      }
    for (const [key, story] of wanted) make(key, story);
    if (moved && view) refreshPages(view);
    // The pages drawn anew: every box painted.
    for (const key of wanted.keys()) paint(key);
  }, [view, wanted, heights, make, paint]);

  const hostRef = useCallback((element: HTMLDivElement | null) => {
    host.current = element;
  }, []);
  return useMemo(
    () => ({
      host: hostRef,
      hold: (key: string, story: WantedStory) => {
        held.current.add(key);
        return make(key, story);
      },
      release: (key: string) => {
        held.current.delete(key);
        const source = sources.current.get(key);
        if (!source || drawn.current.has(key)) return;
        source.destroy();
        sources.current.delete(key);
        heights.current.delete(key);
        if (making.current.view) refreshPages(making.current.view);
      },
      repaint: paint,
    }),
    [hostRef, make, heights, paint],
  );
}
