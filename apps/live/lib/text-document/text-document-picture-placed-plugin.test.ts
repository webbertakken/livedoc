// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "In the editor": a placed picture is drawn at its place, out of its line;
// the text keeps clear of a Wrap or Break picture from its paragraph's start; a picture fixed on the page is drawn at
// its offsets from its anchor's page.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView, type Decoration, type DecorationSet } from 'prosemirror-view';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { PLACED_ROOM_CLASS } from './text-document-picture-placed';
import {
  placedAt,
  placedPicturesPlugin,
  setPlacedShifts,
} from './text-document-picture-placed-plugin';

const margin = { top: 0, right: 0, bottom: 0, left: 0 };
const placed = (wrap: string, moves = 'with-text') =>
  schema.nodes[PICTURE]!.create({
    media: 'm',
    width: 100,
    height: 50,
    placement: { wrap, margin, moves, x: 10, y: 20 },
  });

function setup(...pictures: ReturnType<typeof placed>[]) {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [schema.text('ab'), ...pictures, schema.text('cd')]),
  ]);
  return new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [placedPicturesPlugin({ columnWidth: () => 400 })] }),
  });
}
const PICTURE_AT = 3;
const decorations = (view: EditorView): Decoration[] =>
  (view.someProp('decorations', (f) => f(view.state)) as DecorationSet | null)?.find() ?? [];

describe('placedPicturesPlugin', () => {
  it('marks a placed picture with its layout, and its room at its paragraph’s start', () => {
    const view = setup(placed('wrap'));
    const [room, mark] = decorations(view);
    expect(room).toMatchObject({ from: 1, to: 1 });
    const dom = view.dom.querySelector<HTMLElement>(`.${PLACED_ROOM_CLASS}`)!;
    expect(dom.parentElement?.tagName).toBe('P');
    expect(dom.getAttribute('aria-hidden')).toBe('true');
    expect(dom.getAttribute('style')).toContain('float: left; height: 70pt');
    expect(mark).toMatchObject({ from: PICTURE_AT, to: PICTURE_AT + 1 });
    expect(mark!.spec).toEqual({
      placed: {
        picture: { left: 10, top: 20 },
        layer: 'flow',
        room: { side: 'left', top: 20, bottom: 70, left: 10, right: 110 },
      },
    });
  });

  it('gives In front of text and Behind text no room', () => {
    const view = setup(placed('front'), placed('behind'));
    expect(decorations(view).map((d): unknown => d.spec)).toEqual([
      { placed: { picture: { left: 10, top: 20 }, layer: 'front' } },
      { placed: { picture: { left: 10, top: 20 }, layer: 'behind' } },
    ]);
  });

  it('leaves a picture in line alone', () => {
    const view = setup(schema.nodes[PICTURE]!.create({ media: 'm', width: 10, height: 10 }));
    expect(decorations(view)).toEqual([]);
  });

  it('moves a picture fixed on the page by its paragraph’s place, mapped through edits', () => {
    const view = setup(placed('front', 'page'));
    expect(setPlacedShifts(view, new Map([[PICTURE_AT, { x: -72, y: -100 }]]))).toBe(true);
    expect(placedAt(view.state, PICTURE_AT)?.picture).toEqual({ left: -62, top: -80 });
    // The same shifts again change nothing.
    expect(setPlacedShifts(view, new Map([[PICTURE_AT, { x: -72.2, y: -100.1 }]]))).toBe(false);
    view.dispatch(view.state.tr.insertText('x', 1));
    expect(placedAt(view.state, PICTURE_AT + 1)?.picture).toEqual({ left: -62, top: -80 });
  });
});
