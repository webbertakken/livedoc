// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Headers and footers": each page draws its header and footer in its
// margins from one source per story and width; an empty one draws nothing; a source's height reaches the layout; no
// pages, no sources.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import * as Y from 'yjs';
import { storyFragment, TextDocumentState } from '@livedoc/text-documents';
import { refreshPages } from '@/lib/text-document/pagination/pagination-plugin';
import type { PageGeometry } from '@/lib/text-document/pagination/pagination-draw';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { TextDocumentSheets } from './TextDocumentSheets';
import { storiesWanted, useTextDocumentStories } from './useTextDocumentStories';
import { TextDocumentEndNotes } from './TextDocumentEndNotes';
import type { PageNote } from '@/lib/text-document/pagination/pagination-notes';

vi.mock('@/lib/text-document/pagination/pagination-plugin', () => ({ refreshPages: vi.fn() }));

let doc: Y.Doc;
let view: EditorView;

function story(id: string, text: string) {
  const paragraph = new Y.XmlElement('paragraph');
  if (text) paragraph.insert(0, [new Y.XmlText(text)]);
  storyFragment(doc, id).insert(0, [paragraph]);
}

const place = (id: string, width = 300) => ({
  story: id,
  key: `${id}@${width}`,
  left: 40,
  width,
  margin: 24,
});

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(18);
  doc = TextDocumentState.load();
  story('h', 'Header');
  story('f', 'Footer');
  story('e', '');
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ schema: textDocumentSchema }),
  });
  view.dom.setAttribute('data-text-document-styles', 'scope');
});

afterEach(() => {
  view.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(refreshPages).mockClear();
});

function Harness({
  pages,
  heights,
  endNotes = [],
}: {
  pages: PageGeometry[] | null;
  heights: Map<string, number>;
  endNotes?: PageNote[];
}) {
  const liveDoc = useRef<Y.Doc | null>(doc);
  const held = useRef(heights);
  const stories = useTextDocumentStories({
    view,
    liveDoc,
    format: 'odf',
    pages,
    heights: held,
    endNotes,
  });
  return (
    <div data-page-format="pages">
      <TextDocumentSheets pages={pages} shadow storyHost={stories.host} />
      <TextDocumentEndNotes notes={endNotes} />
    </div>
  );
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('storiesWanted', () => {
  it('names each story at each width once', () => {
    const pages = [
      { width: 1, height: 1, header: place('h'), footer: place('f') },
      { width: 1, height: 1, header: place('h') },
      { width: 1, height: 1, header: place('h', 200) },
    ];
    expect([...storiesWanted(pages).keys()]).toEqual(['h@300', 'f@300', 'h@200']);
    expect(storiesWanted(null).size).toBe(0);
  });
});

describe('TextDocumentSheets with headers and footers', () => {
  it('draws each page’s header at its margin and its footer at its foot ("Drawn")', async () => {
    const heights = new Map<string, number>();
    const pages = [
      { width: 400, height: 500, header: place('h'), footer: place('f') },
      { width: 400, height: 500, header: place('h') },
    ];
    const { container } = render(<Harness pages={pages} heights={heights} />);
    await settle();
    const headers = container.querySelectorAll<HTMLElement>('[data-page-story="header"]');
    expect(headers).toHaveLength(2);
    expect(headers[0]!.textContent).toBe('Header');
    expect(headers[0]!.style.top).toBe('24px');
    expect(headers[0]!.style.left).toBe('40px');
    expect(headers[0]!.style.width).toBe('300px');
    const [footer] = container.querySelectorAll<HTMLElement>('[data-page-story="footer"]');
    expect(footer!.style.bottom).toBe('24px');
    expect(footer!.textContent).toBe('Footer');
    // One source a story at a width, its height kept for the layout.
    expect(container.querySelectorAll('[data-story-source]')).toHaveLength(2);
    expect(heights.get('h@300')).toBe(18);
    expect(refreshPages).toHaveBeenCalledWith(view);
    // Never read, never focused.
    expect(headers[0]!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(headers[0]!.querySelector('[contenteditable]')).toBeNull();
  });

  it('draws an empty one not at all', async () => {
    const heights = new Map<string, number>();
    const pages = [{ width: 400, height: 500, header: place('e') }];
    const { container } = render(<Harness pages={pages} heights={heights} />);
    await settle();
    expect(container.querySelector('[data-page-story]')!.childNodes).toHaveLength(0);
    expect(heights.has('e@300')).toBe(false);
  });

  it('empties a header made empty, and paints it again when written in', async () => {
    const pages = [{ width: 400, height: 500, header: place('h') }];
    const { container } = render(<Harness pages={pages} heights={new Map()} />);
    await settle();
    const text = (storyFragment(doc, 'h').get(0) as Y.XmlElement).get(0) as Y.XmlText;
    act(() => text.delete(0, text.length));
    await settle();
    const box = container.querySelector('[data-page-story="header"]')!;
    expect(box.childNodes).toHaveLength(0);
    act(() => text.insert(0, 'Back'));
    await settle();
    expect(box.textContent).toBe('Back');
  });

  it('paints every page again when the header changes in the live state', async () => {
    const pages = [
      { width: 400, height: 500, header: place('h') },
      { width: 400, height: 500, header: place('h') },
    ];
    const { container } = render(<Harness pages={pages} heights={new Map()} />);
    await settle();
    const text = (storyFragment(doc, 'h').get(0) as Y.XmlElement).get(0) as Y.XmlText;
    act(() => text.insert(6, ' two'));
    await settle();
    const drawn = [...container.querySelectorAll('[data-page-story="header"]')];
    expect(drawn.map((d) => d.textContent)).toEqual(['Header two', 'Header two']);
  });

  it('takes a source away, and its height, when no page draws it; none without pages', async () => {
    const heights = new Map<string, number>();
    const pages = [{ width: 400, height: 500, header: place('h'), footer: place('f') }];
    const { container, rerender, unmount } = render(<Harness pages={pages} heights={heights} />);
    await settle();
    vi.mocked(refreshPages).mockClear();
    rerender(
      <Harness pages={[{ width: 400, height: 500, header: place('h') }]} heights={heights} />,
    );
    await settle();
    expect(container.querySelectorAll('[data-story-source]')).toHaveLength(1);
    expect(heights.has('f@300')).toBe(false);
    expect(refreshPages).toHaveBeenCalledWith(view);
    rerender(<Harness pages={null} heights={heights} />);
    await settle();
    expect(container.querySelectorAll('[data-story-source]')).toHaveLength(0);
    expect(container.querySelector('[data-page-story]')).toBeNull();
    unmount();
    expect(heights.size).toBe(0);
  });
});

// page-layout.md "Footnotes": each page's notes at the foot of its text area under a short rule, each led by its
// number; without pages, under the writing.
describe('footnotes drawn', () => {
  const note = (id: string, number: number, width = 300): PageNote => ({
    story: id,
    key: `${id}@${width}`,
    number,
    left: 40,
    width,
  });

  it('names each note at its width among the stories wanted, pages’ and the writing’s', () => {
    const pages = [{ width: 1, height: 1, notes: [note('n', 1)] }];
    expect(storiesWanted(pages, [note('m', 2, 500)])).toEqual(
      new Map([
        ['n@300', { story: 'n', width: 300, kind: 'footnote' }],
        ['m@500', { story: 'm', width: 500, kind: 'footnote' }],
      ]),
    );
  });

  it('draws a page’s notes above its bottom margin, under a rule, each led by its number', async () => {
    const heights = new Map<string, number>();
    const pages = [{ width: 400, height: 500, bottom: 48, notes: [note('h', 1), note('f', 2)] }];
    const { container } = render(<Harness pages={pages} heights={heights} />);
    await settle();
    const area = container.querySelector<HTMLElement>('[data-page-notes]')!;
    expect(area.style.bottom).toBe('48px');
    expect(area.style.left).toBe('40px');
    expect(area.style.width).toBe('300px');
    expect(area.querySelector('[data-notes-rule]')).not.toBeNull();
    const boxes = area.querySelectorAll('[data-note-number]');
    expect([...boxes].map((b) => b.textContent)).toEqual(['1Header', '2Footer']);
    expect(boxes[0]!.querySelector('sup.text-document-note-number')!.textContent).toBe('1');
    // Its height reaches the layout.
    expect(heights.get('h@300')).toBe(18);
  });

  it('draws the notes under the writing without pages, as a list', async () => {
    const { container, getByRole } = render(
      <Harness pages={null} heights={new Map()} endNotes={[note('h', 1, 500)]} />,
    );
    await settle();
    const list = getByRole('region', { name: 'Footnotes' });
    expect(list.querySelector('li')!.textContent).toBe('1Header');
    expect(container.querySelector('[data-page-notes]')).toBeNull();
  });

  it('draws nothing without notes', () => {
    const { container } = render(<TextDocumentEndNotes notes={[]} />);
    expect(container.childNodes).toHaveLength(0);
  });
});
