// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "The picture's bar": a host under each picture, placed under its bounds;
// Alt+F10 on a selected picture goes to its bar's first button, while one is drawn.
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { PICTURE_BAR_CLASS, pictureBarHost, pictureBarKeys } from './text-document-picture-bar';

const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((v) => v.destroy()));

const PICTURE_AT = 3;
function setup(drawing: string | null) {
  const picture = schema.nodes[PICTURE]!.create({ media: 'm', width: 60, height: 30, drawing });
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [schema.text('ab'), picture, schema.text('cd')]),
  ]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [pictureBarKeys()],
    }),
  });
  views.push(view);
  return view;
}
const altF10 = (view: EditorView) =>
  view.someProp('handleKeyDown', (f) =>
    f(view, new KeyboardEvent('keydown', { key: 'F10', altKey: true })),
  );

describe('pictureBarHost', () => {
  it('places a host under the picture\u2019s bounds, and takes it away', () => {
    const dom = document.createElement('span');
    const host = pictureBarHost(dom);
    host.place({ left: -5, top: 2, height: 40 });
    const made = dom.querySelector<HTMLElement>(`.${PICTURE_BAR_CLASS}`)!;
    expect(made.dataset.pictureBar).toBe('');
    expect([made.style.left, made.style.top]).toEqual(['-5pt', '42pt']);
    host.destroy();
    expect(dom.children).toHaveLength(0);
  });
});

describe('pictureBarKeys', () => {
  it.each([['drawing-1'], [null]])(
    "goes to the selected picture's bar on Alt+F10, while one is drawn (drawing %s)",
    (drawing) => {
      const view = setup(drawing);
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, PICTURE_AT)));
      const dom = view.nodeDOM(PICTURE_AT) as HTMLElement;
      expect(altF10(view)).toBeFalsy();
      const button = document.createElement('button');
      pictureBarHost(dom).place({ left: 0, top: 0, height: 30 });
      dom.querySelector(`.${PICTURE_BAR_CLASS}`)!.append(button);
      document.body.append(view.dom);
      expect(altF10(view)).toBe(true);
      expect(document.activeElement).toBe(button);
      view.dom.remove();
    },
  );

  it('leaves Alt+F10 alone off a picture', () => {
    expect(altF10(setup('drawing-1'))).toBeFalsy();
  });
});
