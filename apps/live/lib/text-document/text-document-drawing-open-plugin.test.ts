// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Opening it again", "The picture's bar": a double-click on a drawing's
// picture opens its drawing tab; a plain picture's is left alone; Alt+F10 reaches the picture's bar.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { drawingOpenPlugin, type OpenDrawing } from './text-document-drawing-open-plugin';

const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((v) => v.destroy()));

const PICTURE_AT = 3;
function setup(drawing: string | null, open: OpenDrawing | null) {
  const picture = schema.nodes[PICTURE]!.create({ media: 'm', width: 60, height: 30, drawing });
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [schema.text('ab'), picture, schema.text('cd')]),
  ]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [drawingOpenPlugin(() => open)],
    }),
  });
  views.push(view);
  return view;
}
const doubleClick = (view: EditorView, direct = true) =>
  view.someProp('handleDoubleClickOn', (f) =>
    f(
      view,
      PICTURE_AT,
      view.state.doc.nodeAt(PICTURE_AT)!,
      PICTURE_AT,
      new MouseEvent('dblclick'),
      direct,
    ),
  );

describe('drawingOpenPlugin', () => {
  it("opens a drawing's tab on a double-click on its picture, saying where the picture is", () => {
    const open = vi.fn();
    expect(doubleClick(setup('drawing-1', open))).toBe(true);
    expect(open).toHaveBeenCalledWith('drawing-1', PICTURE_AT);
  });

  it('leaves a plain picture, a press inside another node, and a surface that opens none alone', () => {
    const open = vi.fn();
    expect(doubleClick(setup(null, open))).toBeFalsy();
    expect(doubleClick(setup('drawing-1', open), false)).toBeFalsy();
    expect(doubleClick(setup('drawing-1', null))).toBeFalsy();
    expect(open).not.toHaveBeenCalled();
  });
});
