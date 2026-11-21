// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Footnotes": Insert > Footnote puts a mark at the caret and enters its
// new note; a press on a drawn note enters it; the toolbar acts on it; Escape or a press on the body leaves, the caret
// just after its mark; its mark gone ends the editing; a note and a header are never edited at once; Move to current,
// next and previous footnote go between marks and notes; putting in and entering are an Editor's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin, yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { storyFragment, TextDocumentState } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';
import { FOOTNOTE_ITEM, marksIn } from '@/lib/text-document/text-document-footnotes-edit';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { textDocumentUndoPlugins } from '@/lib/text-document/text-document-undo';
import { TextDocumentEndNotes } from './TextDocumentEndNotes';
import { TextDocumentPageNotes } from './TextDocumentPageNotes';
import { TextDocumentSheets } from './TextDocumentSheets';
import {
  MOVE_TO_CURRENT_FOOTNOTE,
  MOVE_TO_NEXT_FOOTNOTE,
  MOVE_TO_PREVIOUS_FOOTNOTE,
  noteShown,
} from './useTextDocumentNoteEditing';
import { useTextDocumentPageStories } from './useTextDocumentPageStories';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
// jsdom lays nothing out: a caret scrolled into view has no rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

vi.mock('@/lib/text-document/pagination/pagination-plugin', () => ({
  refreshPages: vi.fn(),
  pageIndexAt: () => 0,
  noteWidthAt: () => 300,
}));

let doc: Y.Doc;
let view: EditorView;

const place = { left: 40, width: 300, header: 24, footer: 24 };
const note = (story: string, number: number): PageNote => ({
  story,
  key: `${story}@300`,
  number,
  left: 40,
  width: 300,
});
const page = (notes: PageNote[] = []): PageGeometry => ({
  width: 400,
  height: 500,
  top: 96,
  bottom: 96,
  section: 0,
  slot: 'default',
  first: true,
  place,
  ...(notes.length ? { notes } : {}),
});
// The notes the body's marks name, in order, on one page.
const laid = () => [page(marksIn(view.state.doc).map((m, i) => note(m.story, i + 1)))];
const caret = (pos: number) =>
  act(() => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos))));
const written = (story: string, text: string) => {
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  storyFragment(doc, story).insert(0, [paragraph]);
};

beforeEach(async () => {
  document.elementFromPoint = () => null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  doc = TextDocumentState.load();
  const body = TextDocumentState.body(doc);
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText('Hello world')]);
  doc.transact(() => {
    body.delete(0, body.length);
    body.insert(0, [paragraph]);
  });
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [ySyncPlugin(body), ...textDocumentUndoPlugins()],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => {
  view.destroy();
  vi.unstubAllGlobals();
  vi.mocked(track).mockClear();
  document.body.replaceChildren();
});

type Seen = ReturnType<typeof useTextDocumentPageStories>;

function Harness({
  pages,
  endNotes = [],
  writes = true,
  seen,
}: {
  pages: PageGeometry[] | null;
  endNotes?: PageNote[];
  writes?: boolean;
  seen: (stories: Seen) => void;
}) {
  const liveDoc = useRef<Y.Doc | null>(doc);
  const heights = useRef(new Map<string, number>());
  const stories = useTextDocumentPageStories({
    view,
    liveDoc,
    format: 'odf',
    pages,
    endNotes,
    writes,
    heights,
    caret: new Plugin({}),
    caretSection: 0,
  });
  useLayoutEffect(() => seen(stories));
  return (
    <div data-page-format="pages">
      <TextDocumentSheets
        pages={pages}
        shadow
        storyHost={stories.storyHost}
        editing={stories.editing}
        editingBox={stories.box}
      />
      <TextDocumentPageNotes
        pages={pages}
        editing={stories.note}
        box={stories.noteBox}
        onPress={stories.onNotePress}
      />
      <TextDocumentEndNotes
        notes={endNotes}
        editing={stories.note}
        box={stories.noteBox}
        onPress={stories.onNotePress}
      />
    </div>
  );
}

// What the harness saw last.
const watch = (seen: { current: Seen | null }) => (stories: Seen) => {
  seen.current = stories;
};

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

// Renders, puts a note in at `at`, and lays the pages out with it.
async function inserted(at = 6) {
  const seen: { current: Seen | null } = { current: null };
  const shown = render(<Harness pages={[page()]} seen={watch(seen)} />);
  await settle();
  caret(at);
  act(() => seen.current!.actions[FOOTNOTE_ITEM]!.run());
  shown.rerender(<Harness pages={laid()} seen={watch(seen)} />);
  await settle();
  return { seen, ...shown };
}

describe('noteShown', () => {
  it('finds a note on its page, under the writing, or nowhere', () => {
    expect(noteShown([page(), page([note('a', 1)])], [], 'a')).toEqual({
      page: 1,
      note: note('a', 1),
    });
    expect(noteShown(null, [note('a', 2)], 'a')).toEqual({ page: -1, note: note('a', 2) });
    expect(noteShown([page()], [note('a', 1)], 'a')).toBeNull();
  });
});

describe('Insert > Footnote', () => {
  it('puts a mark at the caret and enters its new note, the toolbar acting on it', async () => {
    const { seen, container } = await inserted();
    const [mark] = marksIn(view.state.doc);
    expect(mark!.pos).toBe(6);
    expect(seen.current!.note).toMatchObject({ story: mark!.story, page: 0, number: 1 });
    const box = container.querySelector<HTMLElement>('[data-note-editing]')!;
    const textbox = box.querySelector('[role="textbox"]')!;
    expect(textbox.getAttribute('aria-label')).toBe('Footnote');
    expect(box.style.getPropertyValue('--note-number')).toBe('"1"');
    expect(seen.current!.activeView).toBe(seen.current!.note!.view);
    expect(document.activeElement).toBe(textbox);
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentFootnote');
  });

  it('is dimmed while a note or a header is edited', async () => {
    const { seen } = await inserted();
    expect(seen.current!.actions[FOOTNOTE_ITEM]!.disabled).toBe(true);
    act(() => seen.current!.leaveNote());
    await settle();
    expect(seen.current!.actions[FOOTNOTE_ITEM]!.disabled).toBe(false);
  });

  it('keeps what is typed in the note, and its mark is one step of the body’s undo', async () => {
    const { seen, rerender } = await inserted();
    const edited = seen.current!.note!.view;
    act(() => edited.dispatch(edited.state.tr.insertText('A source.')));
    const story = seen.current!.note!.story;
    expect(TextDocumentState.storyParagraphs(doc, story)[0]!.text).toBe('A source.');
    act(() => {
      yUndoPluginKey.getState(view.state)!.undoManager.undo();
    });
    rerender(<Harness pages={laid()} seen={watch(seen)} />);
    await settle();
    expect(marksIn(view.state.doc)).toEqual([]);
    // The mark gone ends the editing.
    expect(seen.current!.note).toBeNull();
    expect(document.querySelector('[data-note-editing]')).toBeNull();
  });

  it('is an Editor’s only; moving between marks is anyone’s', async () => {
    const seen: { current: Seen | null } = { current: null };
    render(<Harness pages={[page()]} writes={false} seen={watch(seen)} />);
    await settle();
    expect(seen.current!.actions[FOOTNOTE_ITEM]).toBeUndefined();
    expect(seen.current!.actions[MOVE_TO_CURRENT_FOOTNOTE]).toBeUndefined();
    expect(seen.current!.actions[MOVE_TO_NEXT_FOOTNOTE]).toBeDefined();
    expect(seen.current!.actions[MOVE_TO_PREVIOUS_FOOTNOTE]).toBeDefined();
  });
});

describe('editing a note', () => {
  it('leaves on Escape and on a press on the body, the caret just after its mark', async () => {
    const { seen } = await inserted();
    fireEvent.keyDown(seen.current!.note!.view.dom, { key: 'Escape' });
    await settle();
    expect(seen.current!.note).toBeNull();
    expect(view.state.selection.head).toBe(7);
    expect(document.activeElement).toBe(view.dom);
    act(() => seen.current!.actions[MOVE_TO_CURRENT_FOOTNOTE]!.run());
    await settle();
    expect(seen.current!.note).not.toBeNull();
    fireEvent.mouseDown(view.dom);
    await settle();
    expect(seen.current!.note).toBeNull();
  });

  it('enters a drawn note pressed, painted with its number until then', async () => {
    const { seen, container } = await inserted();
    const story = seen.current!.note!.story;
    act(() => seen.current!.leaveNote());
    await settle();
    // Its own box drawn again, painted: an empty note is its number.
    expect(container.querySelector('[data-note-number="1"]')!.textContent).toBe('1');
    written(story, 'Said');
    await settle();
    const drawn = container.querySelector<HTMLElement>(`[data-note-number="1"]`)!;
    expect(drawn.getAttribute('aria-hidden')).toBe('true');
    expect(drawn.textContent).toBe('1Said');
    fireEvent.mouseDown(drawn, { clientX: 10, clientY: 10 });
    await settle();
    expect(seen.current!.note?.story).toBe(story);
  });

  it('never edits a note and a header at once', async () => {
    const { seen, container } = await inserted();
    act(() => seen.current!.enter('header', 0));
    await settle();
    expect(seen.current!.note).toBeNull();
    expect(seen.current!.editing?.kind).toBe('header');
    act(() => seen.current!.actions[MOVE_TO_NEXT_FOOTNOTE]!.run());
    caret(1);
    act(() => seen.current!.actions[MOVE_TO_NEXT_FOOTNOTE]!.run());
    expect(view.state.selection.head).toBe(7);
    act(() => seen.current!.actions[MOVE_TO_CURRENT_FOOTNOTE]!.run());
    await settle();
    expect(seen.current!.note).not.toBeNull();
    expect(seen.current!.editing).toBeNull();
    expect(container.querySelectorAll('[data-story-editing], [data-note-editing]')).toHaveLength(1);
  });

  it('is edited under the writing where there are no pages', async () => {
    const seen: { current: Seen | null } = { current: null };
    const { rerender, container } = render(<Harness pages={null} seen={watch(seen)} />);
    await settle();
    caret(1);
    act(() => seen.current!.actions[FOOTNOTE_ITEM]!.run());
    const [mark] = marksIn(view.state.doc);
    rerender(<Harness pages={null} endNotes={[note(mark!.story, 1)]} seen={watch(seen)} />);
    await settle();
    expect(seen.current!.note).toMatchObject({ page: -1, number: 1 });
    expect(
      container.querySelector('[data-end-notes] li[data-note-editing] [role="textbox"]'),
    ).not.toBeNull();
  });
});

describe('moving between footnotes', () => {
  it('goes from mark to mark in the body, and from note to note', async () => {
    const { seen, rerender } = await inserted(3);
    act(() => seen.current!.leaveNote());
    caret(9);
    act(() => seen.current!.actions[FOOTNOTE_ITEM]!.run());
    rerender(<Harness pages={laid()} seen={watch(seen)} />);
    await settle();
    // "He[1]llo w[2]orld", the second note edited.
    const [first, second] = marksIn(view.state.doc);
    act(() => seen.current!.actions[MOVE_TO_PREVIOUS_FOOTNOTE]!.run());
    await settle();
    expect(seen.current!.note?.story).toBe(first!.story);
    act(() => seen.current!.actions[MOVE_TO_PREVIOUS_FOOTNOTE]!.run());
    await settle();
    expect(seen.current!.note?.story).toBe(first!.story);
    act(() => seen.current!.actions[MOVE_TO_CURRENT_FOOTNOTE]!.run());
    await settle();
    expect(seen.current!.note).toBeNull();
    expect(view.state.selection.head).toBe(4);
    act(() => seen.current!.actions[MOVE_TO_NEXT_FOOTNOTE]!.run());
    expect(view.state.selection.head).toBe(second!.pos + 1);
    act(() => seen.current!.actions[MOVE_TO_NEXT_FOOTNOTE]!.run());
    expect(view.state.selection.head).toBe(second!.pos + 1);
    act(() => seen.current!.actions[MOVE_TO_PREVIOUS_FOOTNOTE]!.run());
    expect(view.state.selection.head).toBe(4);
    caret(6);
    act(() => seen.current!.actions[MOVE_TO_CURRENT_FOOTNOTE]!.run());
    expect(seen.current!.note).toBeNull();
  });
});
