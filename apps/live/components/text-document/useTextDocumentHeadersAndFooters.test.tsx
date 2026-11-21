// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Editing headers and footers": entering a page's header edits the one
// it shows in place, or makes the section's own; the toolbar acts on it; Escape or a press on the body leaves, an
// empty own one taken away; a double-click in a margin enters it; Editors only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import * as Y from 'yjs';
import { liveFirstHeaders, storyFragment, TextDocumentState } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { textDocumentUndoPlugins } from '@/lib/text-document/text-document-undo';
import { TextDocumentSheets } from './TextDocumentSheets';
import { FOOTER_ITEM, HEADER_ITEM } from './useTextDocumentHeaderEditing';
import { useTextDocumentHeadersAndFooters } from './useTextDocumentHeadersAndFooters';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/text-document/pagination/pagination-plugin', () => ({
  refreshPages: vi.fn(),
  pageIndexAt: () => 1,
}));

let doc: Y.Doc;
let view: EditorView;

const place = { left: 40, width: 300, header: 24, footer: 24 };
const shown = (story: string) => ({ story, key: `${story}@300`, left: 40, width: 300, margin: 24 });
// Page 1 shows header "h"; page 2 shows none.
const pagesWith = (second: Partial<PageGeometry> = {}): PageGeometry[] => [
  {
    width: 400,
    height: 500,
    top: 96,
    bottom: 96,
    section: 0,
    slot: 'first',
    place,
    header: shown('h'),
  },
  { width: 400, height: 500, top: 96, bottom: 96, section: 0, slot: 'default', place, ...second },
];

beforeEach(async () => {
  // A press on the body asks where it landed; jsdom lays nothing out.
  document.elementFromPoint = () => null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  doc = TextDocumentState.load();
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText('Header')]);
  storyFragment(doc, 'h').insert(0, [paragraph]);
  TextDocumentState.setFirstHeaders(doc, 'odf', { header: { first: { story: 'h' } } });
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
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

type Seen = ReturnType<typeof useTextDocumentHeadersAndFooters>;

function Harness({
  pages,
  writes = true,
  seen,
}: {
  pages: PageGeometry[] | null;
  writes?: boolean;
  seen: (headers: Seen) => void;
}) {
  const liveDoc = useRef<Y.Doc | null>(doc);
  const heights = useRef(new Map<string, number>());
  const headers = useTextDocumentHeadersAndFooters({
    view,
    liveDoc,
    format: 'odf',
    pages,
    writes,
    heights,
    caret: new Plugin({}),
  });
  useLayoutEffect(() => seen(headers));
  return (
    <div data-testid="page" onDoubleClick={(event) => headers.onDoubleClick(event, 1)}>
      <TextDocumentSheets
        pages={pages}
        shadow
        storyHost={headers.storyHost}
        editing={headers.editing}
        editingBox={headers.box}
      />
    </div>
  );
}

// What the harness saw last.
const watch = (seen: { current: Seen | null }) => (headers: Seen) => {
  seen.current = headers;
};

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('useTextDocumentHeadersAndFooters', () => {
  it('edits the header a page shows in place, the toolbar acting on it ("Which one is edited")', async () => {
    const seen: { current: Seen | null } = { current: null };
    const { container } = render(<Harness pages={pagesWith()} seen={watch(seen)} />);
    await settle();
    act(() => seen.current!.enter('header', 0));
    await settle();
    const editing = container.querySelector('[data-story-editing="header"]')!;
    const textbox = editing.querySelector('[role="textbox"]')!;
    expect(textbox.getAttribute('aria-label')).toBe('Header');
    expect(textbox.textContent).toBe('Header');
    expect(seen.current!.activeView).toBe(seen.current!.editing!.view);
    expect(seen.current!.activeView).not.toBe(view);
    // The page's own box gives way to the editor.
    expect(container.querySelector('[data-page-sheet="1"] [data-page-story="header"]')).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it('makes the section’s own header on a page that shows none, and takes it away left empty', async () => {
    const seen: { current: Seen | null } = { current: null };
    const { container } = render(<Harness pages={pagesWith()} seen={watch(seen)} />);
    await settle();
    act(() => seen.current!.actions[HEADER_ITEM]!.run());
    await settle();
    const made = liveFirstHeaders(doc)!.header!.default!.story;
    expect(made).toMatch(/^[0-9a-f-]{36}$/);
    expect(liveFirstHeaders(doc)!.header!.first).toEqual({ story: 'h' });
    expect(track).toHaveBeenCalledWith('Tab', 'Changed', 'TextDocumentHeaderFooter');
    expect(container.querySelector('[data-story-editing] [role="textbox"]')).not.toBeNull();
    act(() => seen.current!.leave());
    await settle();
    expect(liveFirstHeaders(doc)!.header).toEqual({ first: { story: 'h' } });
    expect(track).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-story-editing]')).toBeNull();
    expect(document.activeElement).toBe(view.dom);
  });

  it('keeps a header written in when it is left', async () => {
    const seen: { current: Seen | null } = { current: null };
    render(<Harness pages={pagesWith()} seen={watch(seen)} />);
    await settle();
    act(() => seen.current!.enter('footer', 1));
    await settle();
    const edited = seen.current!.editing!.view;
    act(() => edited.dispatch(edited.state.tr.insertText('Footer')));
    act(() => seen.current!.leave());
    await settle();
    const id = liveFirstHeaders(doc)!.footer!.default!.story;
    expect(TextDocumentState.storyParagraphs(doc, id)).toEqual([{ text: 'Footer' }]);
  });

  it('leaves on Escape, and on a press on the body', async () => {
    const seen: { current: Seen | null } = { current: null };
    render(<Harness pages={pagesWith()} seen={watch(seen)} />);
    await settle();
    act(() => seen.current!.enter('header', 0));
    await settle();
    fireEvent.keyDown(seen.current!.editing!.view.dom, { key: 'Escape' });
    await settle();
    expect(seen.current!.editing).toBeNull();
    // The page's own box is drawn again, painted.
    expect(
      document.querySelector('[data-page-sheet="1"] [data-page-story="header"]')!.textContent,
    ).toBe('Header');
    act(() => seen.current!.enter('header', 0));
    await settle();
    fireEvent.mouseDown(view.dom);
    await settle();
    expect(seen.current!.editing).toBeNull();
  });

  it('switches from a header to a footer, leaving the first', async () => {
    const seen: { current: Seen | null } = { current: null };
    const { container } = render(<Harness pages={pagesWith()} seen={watch(seen)} />);
    await settle();
    act(() => seen.current!.enter('header', 0));
    await settle();
    act(() => seen.current!.enter('footer', 0));
    await settle();
    expect(seen.current!.editing!.kind).toBe('footer');
    expect(container.querySelectorAll('[data-story-editing]')).toHaveLength(1);
  });

  it('enters a margin double-clicked, never a page’s middle or the edited one', async () => {
    const seen: { current: Seen | null } = { current: null };
    const { getByTestId } = render(<Harness pages={pagesWith()} seen={watch(seen)} />);
    await settle();
    fireEvent.doubleClick(getByTestId('page'), { clientY: 250 });
    expect(seen.current!.editing).toBeNull();
    fireEvent.doubleClick(getByTestId('page'), { clientY: 10 });
    await settle();
    expect(seen.current!.editing).toMatchObject({ page: 0, kind: 'header', story: 'h' });
    fireEvent.doubleClick(document.querySelector('[data-story-editing] [role="textbox"]')!, {
      clientY: 490,
    });
    expect(seen.current!.editing!.kind).toBe('header');
  });

  it('stops editing when its page shows headers no more, as pageless', async () => {
    const seen: { current: Seen | null } = { current: null };
    const { rerender } = render(<Harness pages={pagesWith()} seen={watch(seen)} />);
    await settle();
    act(() => seen.current!.enter('header', 0));
    await settle();
    const edited = seen.current!.editing!.view;
    rerender(<Harness pages={null} seen={watch(seen)} />);
    await settle();
    expect(seen.current!.editing).toBeNull();
    expect(seen.current!.activeView).toBe(view);
    expect(edited.isDestroyed || !edited.editable).toBe(true);
  });

  it('offers nothing to a person who cannot edit, and dims the items without pages', async () => {
    const seen: { current: Seen | null } = { current: null };
    const { rerender } = render(<Harness pages={pagesWith()} writes={false} seen={watch(seen)} />);
    await settle();
    expect(seen.current!.actions).toEqual({});
    act(() => seen.current!.enter('header', 0));
    expect(seen.current!.editing).toBeNull();
    rerender(<Harness pages={[]} seen={watch(seen)} />);
    expect(seen.current!.actions[FOOTER_ITEM]!.disabled).toBe(true);
  });
});
