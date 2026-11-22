// LiveDoc's model fragment (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"): made from a copied
// slice, read back only when it is one LiveDoc wrote, and placed in the tab it came from or in another document.
import { describe, expect, it } from 'vitest';
import { Slice } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { ListDefinition, Styles, type PictureMedia, type Style } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  FRAGMENT_MAX_CHARS,
  makeFragment,
  placeFragment,
  readFragment,
  type FragmentContext,
  type NodeJson,
} from './text-document-clipboard-fragment';

const custom: Style = {
  id: 'Quote',
  name: 'Quote',
  family: 'paragraph',
  parent: 'Standard',
  paragraph: { indentStart: 36 },
  text: { italic: true },
};
const emphasis: Style = {
  id: 'Emph',
  name: 'Emph',
  family: 'text',
  paragraph: {},
  text: { bold: true },
};

const odf: FragmentContext = {
  documentId: 'd1',
  tabId: 't1',
  format: 'odf',
  styles: [...Styles.builtIn('odf'), custom, emphasis],
  defaults: Styles.defaults(),
  lists: { L1: ListDefinition.of('number') },
};
const ooxml: FragmentContext = {
  documentId: 'd2',
  tabId: 't2',
  format: 'ooxml',
  styles: Styles.builtIn('ooxml'),
  defaults: Styles.defaults(),
  lists: { L1: ListDefinition.of('bullet') },
};

const kept = { name: 'bookmark', xml: { xml: '<x/>', ns: {} } };
const doc = schema.node('doc', null, [
  schema.nodes.paragraph!.create({ style: 'Heading_20_1' }, schema.text('Title')),
  schema.nodes.paragraph!.create({ style: 'Quote', text: { color: '#ff0000' } }, [
    schema.text('quoted', [schema.marks.text_style!.create({ id: 'Emph' })]),
    schema.nodes.kept_inline!.create(kept),
  ]),
  schema.nodes.paragraph!.create(
    { style: 'Standard', list: { id: 'L1', level: 0, unnumbered: true } },
    schema.text('item'),
  ),
]);

function copied(from = 1, to = doc.content.size - 1) {
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
  return makeFragment(state.selection.content(), odf);
}

const paragraphs = (content: NodeJson[] | undefined) =>
  (content ?? []).filter((n) => n.type === 'paragraph');

describe('makeFragment', () => {
  it('holds the slice and only the styles and lists it names, with their parents', () => {
    const fragment = copied();
    expect(fragment.source).toEqual({ documentId: 'd1', tabId: 't1', format: 'odf' });
    expect(fragment.styles.map((s) => s.id).sort()).toEqual(
      ['Emph', 'Heading_20_1', 'Quote', 'Standard'].sort(),
    );
    expect(Object.keys(fragment.lists)).toEqual(['L1']);
    expect(fragment.slice.openStart).toBe(1);
  });

  it('makes an empty fragment of an empty slice', () => {
    expect(makeFragment(Slice.empty, odf).slice).toEqual({});
  });
});

describe('readFragment', () => {
  it('reads back what was made', () => {
    const fragment = copied();
    expect(readFragment(JSON.stringify(fragment))).toEqual({ ok: true, fragment });
  });

  it('refuses a fragment not LiveDoc wrote, naming why', () => {
    expect(readFragment('{')).toEqual({ ok: false, reason: 'not-json' });
    expect(readFragment('{"v":2}')).toEqual({ ok: false, reason: 'shape' });
    const fragment = copied();
    expect(readFragment(JSON.stringify({ ...fragment, styles: [{ id: 1 }] }))).toEqual({
      ok: false,
      reason: 'shape',
    });
    expect(readFragment(JSON.stringify({ ...fragment, lists: { L1: {} } }))).toEqual({
      ok: false,
      reason: 'shape',
    });
    expect(readFragment(' '.repeat(FRAGMENT_MAX_CHARS + 1))).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });
});

describe('placeFragment', () => {
  it('places a fragment as copied in the tab it came from, kept content included', () => {
    const fragment = copied();
    expect(placeFragment(fragment, odf)).toEqual({
      slice: fragment.slice,
      lists: {},
      left: 0,
      notes: {},
      media: {},
    });
  });

  it('maps built-in styles by role, and makes another style Normal text with its look', () => {
    const placed = placeFragment(copied(), ooxml);
    const [title, quote, item] = paragraphs(placed.slice.content);
    expect(title!.attrs!.style).toBe('Heading1');
    expect(quote!.attrs!.style).toBe('Normal');
    expect(quote!.attrs!.props).toEqual({ indentStart: 36 });
    // OOXML has no paragraph text formatting: it moves onto the runs; the text style's look stays as marks.
    expect(quote!.attrs!.text).toBeNull();
    const marks = quote!.content![0]!.marks!.map((m) => [m.type, m.attrs?.value]);
    expect(marks).toEqual(
      expect.arrayContaining([
        ['italic', true],
        ['color', '#ff0000'],
        ['bold', true],
      ]),
    );
    expect(marks.some(([type]) => type === 'text_style')).toBe(false);
    expect(item!.attrs!.style).toBe('Normal');
    expect(item!.attrs!.list).toEqual({ id: 'L2', level: 0 });
    expect(placed.lists).toEqual({ L2: ListDefinition.of('number') });
  });

  it('leaves content kept from the other file out, and counts it', () => {
    const placed = placeFragment(copied(), { ...odf, documentId: 'd3' });
    const quote = paragraphs(placed.slice.content)[1]!;
    expect(quote.content!.map((n) => n.type)).toEqual(['text']);
    expect(placed.left).toBe(1);
  });

  it('keeps a style the target holds by the same id and name, and a list unnumbered in ODF', () => {
    const target = { ...odf, tabId: 't9', lists: {} };
    const placed = placeFragment(copied(), target);
    const [, quote, item] = paragraphs(placed.slice.content);
    expect(quote!.attrs!.style).toBe('Quote');
    expect(quote!.attrs!.props).toBeNull();
    expect(quote!.attrs!.text).toEqual({ color: '#ff0000' });
    expect(quote!.content![0]!.marks).toEqual([{ type: 'text_style', attrs: { id: 'Emph' } }]);
    expect(item!.attrs!.list).toEqual({ id: 'L1', level: 0, unnumbered: true });
  });

  it('gives each list one new id, past those the target holds or has taken', () => {
    const placed = placeFragment(copied(), { ...ooxml, listIds: ['L7'] });
    expect(Object.keys(placed.lists)).toEqual(['L8']);
  });
});

// page-layout.md "Footnotes": a copied mark's note travels with it, placed in another document's terms as the slice is.
describe('footnotes in the fragment', () => {
  const noted = schema.node('doc', null, [
    schema.nodes.paragraph!.create({ style: 'Standard' }, [
      schema.text('Said'),
      schema.nodes.footnote!.create({ story: 'n1' }),
    ]),
  ]);
  const noteWriting: NodeJson[] = [
    {
      type: 'paragraph',
      attrs: { style: 'Quote', list: { id: 'L1', level: 0 } },
      content: [{ type: 'text', text: 'Source' }],
    },
  ];
  const withNotes: FragmentContext = {
    ...odf,
    readNote: (story) => (story === 'n1' ? noteWriting : null),
  };
  const copiedNote = () => {
    const state = EditorState.create({
      doc: noted,
      selection: TextSelection.create(noted, 1, noted.content.size - 1),
    });
    return makeFragment(state.selection.content(), withNotes);
  };

  it('carries the writing of each copied mark’s note, with the styles and lists it names', () => {
    const fragment = copiedNote();
    expect(fragment.notes).toEqual({ n1: noteWriting });
    expect(fragment.styles.map((s) => s.id)).toContain('Quote');
    expect(Object.keys(fragment.lists)).toEqual(['L1']);
    expect(copied().notes).toBeUndefined();
  });

  it('reads notes back, and refuses notes of the wrong shape', () => {
    const fragment = copiedNote();
    expect(readFragment(JSON.stringify(fragment))).toEqual({ ok: true, fragment });
    expect(readFragment(JSON.stringify({ ...fragment, notes: { n1: 'x' } }))).toEqual({
      ok: false,
      reason: 'shape',
    });
  });

  it('places the notes as copied in the same tab, and in another document’s terms elsewhere', () => {
    expect(placeFragment(copiedNote(), odf).notes).toEqual({ n1: noteWriting });
    const placed = placeFragment(copiedNote(), ooxml);
    const [note] = placed.notes.n1!;
    expect(note!.attrs!.style).toBe('Normal');
    expect(note!.attrs!.list).toEqual({ id: 'L2', level: 0 });
    expect(placed.lists).toEqual({ L2: ListDefinition.of('number') });
  });
});

// objects.md "In the editor": a copied picture brings its media, so it pastes whole into another text document.
describe('pictures in the fragment', () => {
  const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2,
    0, 0, 0, 1, 8, 2, 0, 0, 0,
  ]);
  const pictured = schema.node('doc', null, [
    schema.nodes.paragraph!.create({ style: 'Standard' }, [
      schema.text('a'),
      schema.nodes.picture!.create({ media: 'k1', width: 20, height: 10, alt: 'Field' }),
    ]),
  ]);
  const copy = (media: Record<string, PictureMedia>) => {
    const state = EditorState.create({
      doc: pictured,
      selection: TextSelection.create(pictured, 1, pictured.content.size - 1),
    });
    return makeFragment(state.selection.content(), { ...odf, readMedia: (key) => media[key] });
  };
  const pictures = (content: NodeJson[] | undefined) =>
    paragraphs(content).flatMap((p) => (p.content ?? []).filter((n) => n.type === 'picture'));

  it('carries the media of each copied picture as base64', () => {
    const fragment = copy({ k1: { mediaType: 'image/png', bytes: PNG } });
    expect(fragment.media).toEqual({
      k1: { mediaType: 'image/png', data: btoa(String.fromCharCode(...PNG)) },
    });
    expect(readFragment(JSON.stringify(fragment))).toMatchObject({ ok: true });
  });

  it('refuses media of the wrong shape', () => {
    const fragment = { ...copy({}), media: { k1: { mediaType: 'image/png' } } };
    expect(readFragment(JSON.stringify(fragment))).toEqual({ ok: false, reason: 'shape' });
  });

  it('places the picture whole in another document, bringing its media', () => {
    const placed = placeFragment(copy({ k1: { mediaType: 'image/png', bytes: PNG } }), ooxml);
    expect(pictures(placed.slice.content)).toHaveLength(1);
    expect(placed.media).toEqual({ k1: { mediaType: 'image/png', bytes: PNG } });
    expect(placed.left).toBe(0);
  });

  it('places it as copied in the tab it came from, which holds its media', () => {
    const placed = placeFragment(copy({ k1: { mediaType: 'image/png', bytes: PNG } }), odf);
    expect(pictures(placed.slice.content)).toHaveLength(1);
    expect(placed.media).toEqual({});
  });

  // objects.md "Inserting": a gallery media travels by its id, served in the target under the placement rules.
  it('carries a gallery media by its image, and places it so', () => {
    const fragment = copy({ k1: { mediaType: 'image/png', image: 'img-1' } });
    expect(fragment.media).toEqual({ k1: { mediaType: 'image/png', image: 'img-1' } });
    const read = readFragment(JSON.stringify(fragment));
    expect(read).toMatchObject({ ok: true });
    const placed = placeFragment(fragment, ooxml);
    expect(placed.media).toEqual({ k1: { mediaType: 'image/png', image: 'img-1' } });
    expect(placed.left).toBe(0);
  });

  it('refuses media holding both bytes and an image', () => {
    const fragment = {
      ...copy({}),
      media: { k1: { mediaType: 'image/png', image: 'img-1', data: 'AA==' } },
    };
    expect(readFragment(JSON.stringify(fragment))).toEqual({ ok: false, reason: 'shape' });
  });

  it('leaves out a picture whose image is no id, or of a type the model does not map', () => {
    for (const media of [
      { mediaType: 'image/png', image: '../../etc' },
      { mediaType: 'image/svg+xml', image: 'img-1' },
    ]) {
      const placed = placeFragment({ ...copy({}), media: { k1: media } }, ooxml);
      expect(placed).toMatchObject({ left: 1, media: {} });
    }
  });
  it('leaves out a picture whose media did not come, or is no picture, and counts it', () => {
    expect(placeFragment(copy({}), ooxml)).toMatchObject({ left: 1, media: {} });
    const text = copy({
      k1: { mediaType: 'image/png', bytes: new TextEncoder().encode('<svg/>') },
    });
    const placed = placeFragment(text, ooxml);
    expect(pictures(placed.slice.content)).toEqual([]);
    expect(placed.left).toBe(1);
  });
});
