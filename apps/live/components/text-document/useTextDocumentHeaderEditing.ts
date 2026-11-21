// Editing a header or footer (docs/specs/034-text-documents/page-layout.md "Editing headers and footers"): Insert >
// Headers and footers or a double-click in a page's margin enters the header or footer that page shows, making the
// section's own when it shows none; its source moves into the page's editing box and takes the caret at its end, and
// the toolbar acts on it; Escape or a press on the body leaves, an empty own one taken away. Editors only.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import type { HeaderFooterKind, HeaderFooterSlot, LiveHeaders } from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import { storyKey } from '@/lib/text-document/pagination/pagination-headers';
import { pageIndexAt } from '@/lib/text-document/pagination/pagination-plugin';
import {
  copyStory,
  liveHeadersOf,
  makeStory,
  removeIfEmpty,
  setLiveHeaders,
  shownStory,
  withSlot,
  withSwitch,
} from '@/lib/text-document/text-document-headers-edit';
import type { StorySource } from '@/lib/text-document/text-document-story-sources';
import type { TextDocumentStories } from './useTextDocumentStories';

/** Insert > Headers and footers' items (text-document-menus.ts). */
export const HEADER_ITEM = 'header';
export const FOOTER_ITEM = 'footer';

/** The header or footer being edited: on which page, which story at which width, and where it is held. */
export type StoryEditing = {
  readonly page: number;
  readonly kind: HeaderFooterKind;
  readonly key: string;
  readonly story: string;
  readonly section: number;
  readonly slot: HeaderFooterSlot;
  /** Its editor: what the toolbar acts on while it is edited. */
  readonly view: EditorView;
  /** The bar's facts: its section's own Different first page, and whether it is the previous section's. */
  readonly differentFirst: boolean;
  readonly linked: boolean;
};

export type TextDocumentHeaderEditing = {
  /** What is being edited, while its page still shows headers; null while the body is. */
  readonly editing: StoryEditing | null;
  /** Enters a page's header or footer: the body's caret's page unless one is given. */
  readonly enter: (kind: HeaderFooterKind, page?: number) => void;
  /** Leaves it, the caret back in the body where it was. */
  readonly leave: () => void;
  /** The callback ref for the box it is edited in. */
  readonly box: (element: HTMLDivElement | null) => void;
  /** The bar's changes ("The bar"): each one step of the body's undo, the page's header entered again after. */
  readonly toggleFirst: () => void;
  readonly toggleLink: () => void;
  readonly remove: () => void;
  /** Runs a change with the edited one left, then enters the page's again (Headers and footers options). */
  readonly changeAround: (run: (was: StoryEditing) => void) => void;
  readonly actions: OfficeActions;
};

export function useTextDocumentHeaderEditing(input: {
  readonly view: EditorView | null;
  readonly liveDoc: RefObject<Y.Doc | null>;
  readonly format: TextDocumentFormat;
  readonly pages: readonly PageGeometry[] | null;
  readonly writes: boolean;
  readonly stories: TextDocumentStories;
}): TextDocumentHeaderEditing {
  const { view, liveDoc, format, pages, writes, stories } = input;
  const [entered, setEntered] = useState<StoryEditing | null>(null);
  // Still on a page that shows headers, and still the person's to edit.
  const editing = entered && writes && pages?.[entered.page]?.place !== undefined ? entered : null;
  const source = useRef<StorySource | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ view, pages, writes, format, stories, entered });
  useLayoutEffect(() => {
    latest.current = { view, pages, writes, format, stories, entered };
  });

  // Back to its hidden place; an empty own one taken out of its section.
  const stop = useCallback(
    (was: StoryEditing) => {
      const { view: body, format: kept, stories: held } = latest.current;
      const doc = liveDoc.current;
      source.current?.stopEditing();
      source.current = null;
      if (body && doc && removeIfEmpty(body, doc, kept, { index: was.section, ...was }))
        track('Tab', 'Changed', 'TextDocumentHeaderFooter');
      held.release(was.key);
      debugLog('[text-document] header footer', {
        section: was.section,
        kind: was.kind,
        slot: was.slot,
        change: 'left',
      });
    },
    [liveDoc],
  );

  const leave = useCallback(() => {
    const { entered: was, view: body } = latest.current;
    if (!was) return;
    stop(was);
    setEntered(null);
    body?.focus();
  }, [stop]);

  const enter = useCallback(
    (kind: HeaderFooterKind, at?: number) => {
      const { view: body, pages: laid, writes: can, format: kept, stories: held } = latest.current;
      const doc = liveDoc.current;
      if (!body || !doc || !can || !laid) return;
      const page = at ?? pageIndexAt(body, body.state.selection.head);
      const shown = laid[page];
      if (!shown?.place || shown.section === undefined || !shown.slot) return;
      const { section, place } = shown;
      if (latest.current.entered) stop(latest.current.entered);
      // Read now, not from the pages: a change on the bar has not been laid out yet.
      const now = shownStory(doc, kind, section, shown.first === true, page + 1);
      const { slot } = now;
      let story = now.story;
      if (!story) {
        story = makeStory(doc);
        setLiveHeaders(
          body,
          doc,
          kept,
          section,
          withSlot(liveHeadersOf(body, doc, section), kind, slot, story),
        );
        track('Tab', 'Changed', 'TextDocumentHeaderFooter');
        debugLog('[text-document] header footer', { section, kind, slot, change: 'made' });
      }
      const key = storyKey(story, place.width);
      const found = held.hold(key, { story, width: place.width, kind });
      if (!found) return;
      source.current = found;
      debugLog('[text-document] header footer', { section, kind, slot, change: 'entered' });
      setEntered({
        page,
        kind,
        key,
        story,
        section,
        slot,
        view: found.view,
        differentFirst: now.differentFirst,
        linked: now.linked && story === now.story,
      });
    },
    [liveDoc, stop],
  );

  // A change made with the edited one left, then the page's header or footer entered again (it may be another now).
  const changeAround = useCallback(
    (run: (was: StoryEditing) => void) => {
      const was = latest.current.entered;
      if (!was) return;
      stop(was);
      latest.current = { ...latest.current, entered: null };
      run(was);
      enter(was.kind, was.page);
    },
    [stop, enter],
  );

  // A change on the bar to the section's own headers, then the page's header entered again.
  const change = useCallback(
    (
      what: string,
      next: (
        own: LiveHeaders | undefined,
        was: StoryEditing,
        doc: Y.Doc,
      ) => LiveHeaders | undefined,
    ) => {
      const { view: body, format: kept } = latest.current;
      const doc = liveDoc.current;
      if (!body || !doc) return;
      changeAround((was) => {
        setLiveHeaders(
          body,
          doc,
          kept,
          was.section,
          next(liveHeadersOf(body, doc, was.section), was, doc),
        );
        track('Tab', 'Changed', 'TextDocumentHeaderFooter');
        debugLog('[text-document] header footer', {
          section: was.section,
          kind: was.kind,
          slot: was.slot,
          change: what,
        });
      });
    },
    [liveDoc, changeAround],
  );
  const toggleFirst = useCallback(() => {
    const on = !latest.current.entered?.differentFirst;
    change(on ? 'first-on' : 'first-off', (own) => withSwitch(own, 'differentFirst', on));
  }, [change]);
  const toggleLink = useCallback(() => {
    const linked = latest.current.entered?.linked === true;
    change(linked ? 'unlinked' : 'linked', (own, was, doc) =>
      withSlot(own, was.kind, was.slot, linked ? copyStory(doc, was.story) : undefined),
    );
  }, [change]);
  const remove = useCallback(() => {
    const { view: body, format: kept, entered: was } = latest.current;
    const doc = liveDoc.current;
    if (!body || !doc || !was || was.linked) return;
    stop(was);
    setLiveHeaders(
      body,
      doc,
      kept,
      was.section,
      withSlot(liveHeadersOf(body, doc, was.section), was.kind, was.slot, undefined),
    );
    track('Tab', 'Changed', 'TextDocumentHeaderFooter');
    debugLog('[text-document] header footer', {
      section: was.section,
      kind: was.kind,
      slot: was.slot,
      change: 'removed',
    });
    setEntered(null);
    body.focus();
  }, [liveDoc, stop]);

  // In its page's editing box while it is edited; back when its page no longer shows headers. The page's own box,
  // drawn again once it is left, is painted again.
  const shownKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    const was = shownKey.current;
    shownKey.current = editing?.key ?? null;
    if (was && was !== shownKey.current) latest.current.stories.repaint(was);
    const edited = source.current;
    if (!edited) return;
    if (editing && box.current) edited.edit(box.current);
    else if (!editing && edited.editing) edited.stopEditing();
  }, [editing]);

  // A press on the body leaves it.
  useLayoutEffect(() => {
    if (!editing || !view) return;
    const dom = view.dom;
    dom.addEventListener('mousedown', leave);
    return () => dom.removeEventListener('mousedown', leave);
  }, [editing, view, leave]);

  const boxRef = useCallback((element: HTMLDivElement | null) => {
    box.current = element;
    // A new box for the one being edited (its page drawn again): it moves there.
    if (element && source.current?.editing) source.current.edit(element);
  }, []);

  const laidOut = (pages?.length ?? 0) > 0;
  const actions = useMemo((): OfficeActions => {
    if (!writes || !view) return {};
    return {
      [HEADER_ITEM]: { run: () => enter('header'), disabled: !laidOut },
      [FOOTER_ITEM]: { run: () => enter('footer'), disabled: !laidOut },
    };
  }, [writes, view, enter, laidOut]);

  return {
    editing,
    enter,
    leave,
    box: boxRef,
    toggleFirst,
    toggleLink,
    remove,
    changeAround,
    actions,
  };
}
