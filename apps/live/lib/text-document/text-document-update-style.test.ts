// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Update to match": the look at the caret, and the paragraph
// conformed to its style.
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Mark } from 'prosemirror-model';
import {
  PLAIN_LOOK,
  SECTION_BREAK,
  StyleLooks,
  TextDocument,
  type Style,
} from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { conformParagraph, lookAtCaret } from './text-document-update-style';

const blank = TextDocument.blank({ format: 'odf' });
const formatting = { styles: blank.styles, defaults: blank.defaults };
const idOf = (role: Style['role']) => blank.styles.find((s) => s.role === role)!.id;
const mark = (name: string, value: unknown) => schema.marks[name]!.create({ value });
const run = (text: string, marks: Mark[] = []) => schema.text(text, marks);

let view: EditorView;
afterEach(() => view?.destroy());

function open(
  inlines: ReturnType<typeof run>[],
  attrs: Record<string, unknown>,
  from: number,
  to = from,
  stored?: Mark[],
) {
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(attrs, inlines)]);
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
  if (stored) state = state.apply(state.tr.setStoredMarks(stored));
  view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
}

describe('lookAtCaret', () => {
  it("reads the text's own formatting over its style, settled, and the style's paragraph look", () => {
    open(
      [run('Big', [mark('size', 24), mark('bold', true), mark('color', '#AA0000')])],
      { style: idOf('heading2') },
      2,
    );
    const look = lookAtCaret(view.state, formatting);
    expect(look.text).toEqual({
      ...PLAIN_LOOK.text,
      font: 'Arial',
      size: 24,
      bold: true,
      color: '#aa0000',
    });
    expect(look.paragraph).toEqual(
      StyleLooks.of(blank.styles, blank.defaults, idOf('heading2')).paragraph,
    );
  });

  it('reads where a selection starts, not what precedes it', () => {
    open([run('plain '), run('italic', [mark('italic', true)])], { style: null }, 7, 13);
    expect(lookAtCaret(view.state, formatting).text.italic).toBe(true);
  });

  it('reads the formatting set for the next characters at an empty caret', () => {
    open([run('text')], { style: null }, 5, 5, [mark('underline', true)]);
    expect(lookAtCaret(view.state, formatting).text.underline).toBe(true);
  });

  it("reads the paragraph's own alignment and spacing over its style's", () => {
    open([run('Centred')], { style: idOf('title'), props: { align: 'center', spaceAfter: 9 } }, 2);
    const look = lookAtCaret(view.state, formatting);
    expect(look.paragraph).toMatchObject({ align: 'center', spaceAfter: 9, keepWithNext: true });
    expect(look.text.size).toBe(26);
  });
});

describe('conformParagraph', () => {
  it("sets the style and drops the look's own formatting, keeping what lies beyond the look", () => {
    open(
      [
        run('Mixed', [mark('size', 24), mark('highlight', '#ffff00')]),
        run(' text', [mark('bold', true)]),
      ],
      {
        style: null,
        props: { align: 'center', pageBreakBefore: true },
        text: { size: 9, highlight: '#00ff00' },
      },
      2,
    );
    conformParagraph(idOf('heading1'))(view.state, view.dispatch);
    const paragraph = view.state.doc.firstChild!;
    expect(paragraph.attrs).toMatchObject({
      style: idOf('heading1'),
      props: { pageBreakBefore: true },
      text: { highlight: '#00ff00' },
    });
    const marks = new Set<string>();
    paragraph.forEach((child) => child.marks.forEach((m) => marks.add(m.type.name)));
    expect([...marks]).toEqual(['highlight']);
    expect(paragraph.textContent).toBe('Mixed text');
  });

  it('leaves no own paragraph formatting where the look took it all', () => {
    open([run('Text')], { style: null, props: { align: 'end' } }, 2);
    conformParagraph(null)(view.state, view.dispatch);
    expect(view.state.doc.firstChild!.attrs).toMatchObject({
      style: null,
      props: null,
      text: null,
    });
  });

  it('refuses where the caret is in no paragraph', () => {
    const doc = schema.node('doc', null, [schema.nodes[SECTION_BREAK]!.create()]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 0) });
    expect(conformParagraph(null)(state)).toBe(false);
  });
});
