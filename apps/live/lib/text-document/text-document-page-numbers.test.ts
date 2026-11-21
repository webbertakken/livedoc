// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page numbers": the presets and the dialog put a page number, aligned
// right, in the default header or footer each section in scope shows (its even one too); Not the first page leaves
// the first page bare; a changed header is a new copy, so the change is one step of the body's undo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin, yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import {
  liveFirstHeaders,
  PageSetup,
  storyFragment,
  TextDocumentState,
  type LiveHeaders,
} from '@livedoc/text-documents';
import { liveHeadersOf } from './text-document-headers-edit';
import {
  applyPageNumbers,
  numberedSections,
  numberedStory,
  unnumberedStory,
} from './text-document-page-numbers';
import { textDocumentSchema as schema } from './text-document-schema';
import { textDocumentUndoPlugins } from './text-document-undo';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

let doc: Y.Doc;
let view: EditorView;

const written = (id: string, ...texts: string[]) => {
  storyFragment(doc, id).insert(
    0,
    texts.map((text) => {
      const p = new Y.XmlElement('paragraph');
      if (text) p.insert(0, [new Y.XmlText(text)]);
      return p;
    }),
  );
  return id;
};

// Each paragraph of a story: its text with a field as [page-number], and its alignment.
const read = (id: string | undefined) =>
  id === undefined
    ? undefined
    : storyFragment(doc, id)
        .toArray()
        .map((p) => {
          const el = p as Y.XmlElement;
          const text = el
            .toArray()
            .map((c) =>
              c instanceof Y.XmlText
                ? String(c.toJSON())
                : `[${String((c as Y.XmlElement).getAttribute('field'))}]`,
            )
            .join('');
          const align = (el.getAttribute('props') as unknown as { align?: string } | undefined)
            ?.align;
          return align ? `${text} (${align})` : text;
        });

beforeEach(async () => {
  doc = TextDocumentState.load();
  const body = TextDocumentState.body(doc);
  const later = new Y.XmlElement('section_break');
  later.setAttribute('start', 'next-page');
  later.setAttribute('setup', PageSetup.of('a4') as never);
  doc.transact(() => {
    body.delete(0, body.length);
    body.insert(0, [new Y.XmlElement('paragraph'), later, new Y.XmlElement('paragraph')]);
  });
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      schema,
      plugins: [ySyncPlugin(body), ...textDocumentUndoPlugins()],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => view.destroy());

describe('numberedStory', () => {
  it('puts the number in an empty header’s paragraph, aligned right', () => {
    const id = numberedStory(doc, written('e', ''));
    expect(id).not.toBe('e');
    expect(read(id)).toEqual(['[page-number] (end)']);
    expect(read('e')).toEqual(['']);
  });

  it('adds a paragraph to one with writing, keeps one that holds a number, makes one for none', () => {
    expect(read(numberedStory(doc, written('w', 'Title')))).toEqual([
      'Title',
      '[page-number] (end)',
    ]);
    const numbered = numberedStory(doc, 'w');
    expect(numberedStory(doc, numbered)).toBe(numbered);
    expect(read(numberedStory(doc, undefined))).toEqual(['[page-number] (end)']);
  });

  it('takes the numbers out of a copy, keeping one without any', () => {
    const numbered = numberedStory(doc, written('t', 'Title'));
    expect(read(unnumberedStory(doc, numbered))).toEqual(['Title', ' (end)']);
    expect(unnumberedStory(doc, 't')).toBe('t');
  });
});

describe('numberedSections', () => {
  const footer = (story: string): LiveHeaders => ({ footer: { default: { story } } });

  it('numbers the first section’s footer for the whole document, the second following it linked', () => {
    const [first, second] = numberedSections(
      doc,
      [
        { headers: undefined, start: undefined },
        { headers: undefined, start: undefined },
      ],
      {
        position: 'footer',
        firstPage: true,
        scope: 'document',
        section: 0,
      },
    );
    expect(read(first!.headers?.footer?.default?.story)).toEqual(['[page-number] (end)']);
    expect(second!.headers).toBeUndefined();
  });

  it('numbers a section’s own and its even one; leaves the first page bare for Not the first page', () => {
    written('d', 'Draft');
    written('v', 'Even');
    written('f', 'Cover');
    const [own] = numberedSections(
      doc,
      [
        {
          headers: {
            header: { default: { story: 'd' }, even: { story: 'v' }, first: { story: 'f' } },
            differentOddEven: true,
          },
          start: undefined,
        },
      ],
      { position: 'header', firstPage: false, scope: 'document', section: 0 },
    );
    expect(read(own!.headers!.header!.default!.story)).toEqual(['Draft', '[page-number] (end)']);
    expect(read(own!.headers!.header!.even!.story)).toEqual(['Even', '[page-number] (end)']);
    expect(own!.headers!.header!.first!.story).toBe('f');
    expect(own!.headers!.differentFirst).toBe(true);
  });

  it('gives a linked section its own numbered copy for This section, and sets its start', () => {
    written('a', 'Shared');
    const [first, second] = numberedSections(
      doc,
      [
        { headers: footer('a'), start: undefined },
        { headers: undefined, start: undefined },
      ],
      { position: 'footer', firstPage: true, scope: 'section', section: 1, start: 5 },
    );
    expect(first).toEqual({ headers: footer('a'), start: undefined });
    expect(read(second!.headers!.footer!.default!.story)).toEqual([
      'Shared',
      '[page-number] (end)',
    ]);
    expect(second!.start).toBe(5);
  });

  it('starts the whole document at a number, the others continuing; Continue takes starts away', () => {
    const sections = [
      { headers: undefined, start: 3 },
      { headers: undefined, start: 9 },
    ];
    const choice = { position: 'footer', firstPage: true, scope: 'document', section: 0 } as const;
    expect(numberedSections(doc, sections, { ...choice, start: 4 }).map((s) => s.start)).toEqual([
      4,
      undefined,
    ]);
    expect(numberedSections(doc, sections, { ...choice, start: null }).map((s) => s.start)).toEqual(
      [undefined, undefined],
    );
    expect(numberedSections(doc, sections, choice).map((s) => s.start)).toEqual([3, 9]);
  });
});

describe('applyPageNumbers', () => {
  it('sets the sections as one undo step, and nothing when nothing changes', () => {
    expect(
      applyPageNumbers(view, doc, 'odf', {
        position: 'header',
        firstPage: true,
        scope: 'section',
        section: 1,
        start: 2,
      }),
    ).toBe(true);
    const own = liveHeadersOf(view, doc, 1)!;
    expect(read(own.header!.default!.story)).toEqual(['[page-number] (end)']);
    expect((view.state.doc.child(1).attrs as { numberStart: number }).numberStart).toBe(2);
    expect(liveFirstHeaders(doc)).toBeUndefined();
    expect(
      applyPageNumbers(view, doc, 'odf', {
        position: 'header',
        firstPage: true,
        scope: 'section',
        section: 1,
        start: 2,
      }),
    ).toBe(false);
    yUndoPluginKey.getState(view.state)!.undoManager.undo();
    expect(liveHeadersOf(view, doc, 1)).toBeUndefined();
    expect((view.state.doc.child(1).attrs as { numberStart: unknown }).numberStart).toBeNull();
  });

  it('sets the first section’s start in the live state', () => {
    applyPageNumbers(view, doc, 'odf', {
      position: 'footer',
      firstPage: false,
      scope: 'document',
      section: 0,
      start: 0,
    });
    expect(TextDocumentState.section(doc, 'odf').numberStart).toBe(0);
    expect(liveFirstHeaders(doc)!.differentFirst).toBe(true);
  });
});
