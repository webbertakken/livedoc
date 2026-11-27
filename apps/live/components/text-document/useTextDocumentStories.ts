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
import type { SuggestingDispatch } from '@/lib/text-document/text-document-suggesting-dispatch';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocumentState, type HeaderFooterKind } from '@livedoc/text-documents';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import { refreshPages } from '@/lib/text-document/pagination/pagination-plugin';
import { StorySource } from '@/lib/text-document/text-document-story-sources';
import { fillFields, numbersOfBox } from '@/lib/text-document/text-document-fields';
import { NOTE_BOX_NUMBER_ATTRIBUTE, numberNote } from '@/lib/text-document/text-document-footnotes';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';
import type { GalleryPictures } from '@/lib/text-document/text-document-gallery-pictures';

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
  /**
   * Each story's writing once, for its suggestion cards (review.md "Suggestion cards"): headers and footers before
   * notes, each in the pages' order; the one being edited read from its own editor.
   */
  readonly writings: () => readonly StoryWritingShown[];
  /** Calls `listener` after any box is painted or a source made or let go; gives back the call that stops it. */
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Where a position of a story's writing is on screen (its client top), or null where none is drawn: in the one being
   * edited, beside the page it is edited on, else beside the copy highest on screen, the first page showing it.
   */
  readonly topOf: (story: string, pos: number) => number | null;
  /** Scrolls the first page's copy of a story into view; false where none is drawn. */
  readonly reveal: (story: string) => boolean;
};

/** A story's writing as the pages draw it, for its cards. */
export type StoryWritingShown = {
  readonly story: string;
  readonly kind: WantedStory['kind'];
  readonly doc: EditorView['state']['doc'];
};

/** A position's client top in a source's own editor, or null where it cannot say. */
function topIn(source: StorySource, pos: number): number | null {
  try {
    return source.view.coordsAtPos(Math.min(pos, source.view.state.doc.content.size)).top;
  } catch {
    return null;
  }
}

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
  /** Where its pictures' gallery images are read from. */
  readonly gallery: GalleryPictures;
  /** How a source's changes are applied around suggesting (review.md "Headers, footers and notes"). */
  readonly suggesting?: SuggestingDispatch;
  /** The settled writing the stories are drawn from, where the body draws one (useTextDocumentReviewPreview). */
  readonly drawnDoc?: Y.Doc | null;
}): TextDocumentStories {
  const { view, liveDoc, format, pages, heights } = input;
  const drawnDoc = input.drawnDoc ?? null;
  const host = useRef<HTMLDivElement | null>(null);
  const sources = useRef(new Map<string, StorySource>());
  // What each source was made as, by its key, and who is told of their changes.
  const madeAs = useRef(new Map<string, WantedStory>());
  const listeners = useRef(new Set<() => void>());
  const tell = useCallback(() => {
    for (const listener of listeners.current) listener();
  }, []);
  const held = useRef(new Set<string>());
  const { endNotes } = input;
  const wanted = useMemo(() => storiesWanted(pages, endNotes), [pages, endNotes]);
  const drawn = useRef(wanted);
  // What a source is made with, read when one is made: in a layout effect or an event handler.
  const making = useRef({
    view,
    format,
    plugins: input.plugins,
    gallery: input.gallery,
    suggesting: input.suggesting,
  });
  useLayoutEffect(() => {
    making.current = {
      view,
      format,
      plugins: input.plugins,
      gallery: input.gallery,
      suggesting: input.suggesting,
    };
  });

  // Each box drawing `key`, painted with its source's writing, or emptied.
  const paint = useCallback(
    (key: string) => {
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
      tell();
    },
    [tell],
  );

  const make = useCallback(
    (key: string, { story, width, kind }: WantedStory): StorySource | undefined => {
      const known = sources.current.get(key);
      if (known) return known;
      const doc = liveDoc.current;
      const container = host.current;
      const { view: body, format: madeFormat, plugins, gallery, suggesting } = making.current;
      if (!body || !doc || !container) return undefined;
      const source = new StorySource({
        doc,
        drawnDoc,
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
        gallery,
        plugins: plugins?.() ?? [],
        ...(suggesting ? { suggesting } : {}),
        onLaid: (laid) => {
          heights.current.set(key, laid.height);
          paint(key);
          refreshPages(body);
        },
      });
      source.subscribe(() => paint(key));
      sources.current.set(key, source);
      madeAs.current.set(key, { story, width, kind });
      return source;
    },
    [liveDoc, drawnDoc, heights, paint],
  );

  // Another editor or document, or the writing drawn from another (settled, or live again): every source goes with the
  // one it was made for, before any is made for the next.
  useLayoutEffect(() => {
    const made = sources.current;
    const kinds = madeAs.current;
    const kept = heights.current;
    const holding = held.current;
    return () => {
      for (const source of made.values()) source.destroy();
      made.clear();
      kinds.clear();
      kept.clear();
      holding.clear();
    };
  }, [view, format, heights, drawnDoc]);

  useLayoutEffect(() => {
    drawn.current = wanted;
    const made = sources.current;
    let moved = false;
    for (const [key, source] of made)
      if (!wanted.has(key) && !held.current.has(key)) {
        source.destroy();
        made.delete(key);
        madeAs.current.delete(key);
        // A height gone moves the pages it pushed.
        moved = heights.current.delete(key) || moved;
      }
    for (const [key, story] of wanted) make(key, story);
    if (moved && view) refreshPages(view);
    // The pages drawn anew: every box painted.
    for (const key of wanted.keys()) paint(key);
  }, [view, wanted, heights, make, paint]);

  // Each source of a story, by its key.
  const sourcesOf = useCallback(
    (story: string) =>
      [...sources.current].filter(([key]) => madeAs.current.get(key)?.story === story),
    [],
  );
  // The copy of a story highest on screen (the first page showing it), with the source it was copied from.
  const firstCopy = useCallback(
    (story: string) => {
      const scope = host.current?.closest(STORY_SCOPE) ?? host.current?.parentElement;
      let first: { copy: Element; top: number; source: StorySource } | null = null;
      for (const [key, source] of sourcesOf(story))
        for (const box of scope?.querySelectorAll(
          `[${STORY_KEY_ATTRIBUTE}="${CSS.escape(key)}"]`,
        ) ?? []) {
          const copy = box.firstElementChild;
          if (!copy) continue;
          const top = copy.getBoundingClientRect().top;
          if (!first || top < first.top) first = { copy, top, source };
        }
      return first;
    },
    [sourcesOf],
  );

  const writings = useCallback((): StoryWritingShown[] => {
    const order = [...drawn.current.keys()];
    const rank = (key: string) => {
      const at = order.indexOf(key);
      return at < 0 ? order.length : at;
    };
    const ranked = [...sources.current]
      .flatMap(([key, source]) => {
        const as = madeAs.current.get(key);
        return as ? [{ key, source, as }] : [];
      })
      .sort(
        (a, b) =>
          Number(a.as.kind === 'footnote') - Number(b.as.kind === 'footnote') ||
          rank(a.key) - rank(b.key),
      );
    const read = new Map<string, StoryWritingShown>();
    for (const { source, as } of ranked) {
      const was = read.get(as.story);
      if (!was || source.editing)
        read.set(as.story, { story: as.story, kind: as.kind, doc: source.view.state.doc });
    }
    return [...read.values()];
  }, []);

  const topOf = useCallback(
    (story: string, pos: number): number | null => {
      const edited = sourcesOf(story).find(([, source]) => source.editing)?.[1];
      if (edited) return topIn(edited, pos);
      const first = firstCopy(story);
      if (!first) return null;
      const at = topIn(first.source, pos);
      return at === null
        ? null
        : first.top + at - first.source.view.dom.getBoundingClientRect().top;
    },
    [sourcesOf, firstCopy],
  );

  const reveal = useCallback(
    (story: string) => {
      const first = firstCopy(story);
      first?.copy.scrollIntoView?.({ block: 'center' });
      return first !== null;
    },
    [firstCopy],
  );

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
        madeAs.current.delete(key);
        heights.current.delete(key);
        tell();
        if (making.current.view) refreshPages(making.current.view);
      },
      repaint: paint,
      writings,
      subscribe: (listener: () => void) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      topOf,
      reveal,
    }),
    [hostRef, make, heights, paint, writings, topOf, reveal, tell],
  );
}
