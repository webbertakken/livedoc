// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page numbers": a field drawn as its page's number or the page count, 1
// with no pages laid out; a header's copy filled with its page's; a header being edited showing its page's.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { Decoration, EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  FIELD_NODE_VIEWS,
  fieldNumbersPlugin,
  fieldView,
  fillFields,
  numbersOfBox,
  setFieldNumbers,
} from './text-document-fields';

const field = (kind: string, props: object = {}) =>
  schema.nodes.field!.create({ field: kind, text: '0', props });
const shown = (number: number, count: number) =>
  Decoration.node(0, 1, {}, { fieldShown: { number, count } });

describe('fieldView', () => {
  it('shows its page’s number or the page count, in its own formatting', () => {
    const number = fieldView(field('page-number', { bold: true }), null, null, [shown(4, 9)]);
    expect(number.dom.textContent).toBe('4');
    expect((number.dom as HTMLElement).dataset.field).toBe('page-number');
    expect((number.dom as HTMLElement).getAttribute('style')).toContain('font-weight: 700');
    expect(fieldView(field('page-count'), null, null, [shown(4, 9)]).dom.textContent).toBe('9');
  });

  it('shows 1 with no pages laid out, and follows a new page', () => {
    const view = fieldView(field('page-count'), null, null, []);
    expect(view.dom.textContent).toBe('1');
    expect(view.update!(field('page-count'), [shown(2, 3)], null as never)).toBe(true);
    expect(view.dom.textContent).toBe('3');
    expect(view.update!(schema.text('x'), [], null as never)).toBe(false);
  });
});

describe('a header’s copy on a page', () => {
  it('is filled with the page’s number and count', () => {
    const box = document.createElement('div');
    box.dataset.pageNumber = '7';
    box.dataset.pageCount = '12';
    box.innerHTML =
      'Page <span data-field="page-number">1</span> of <span data-field="page-count">1</span>';
    fillFields(box, numbersOfBox(box));
    expect(box.textContent).toBe('Page 7 of 12');
    expect(numbersOfBox(document.createElement('div'))).toEqual({ number: 1, count: 1 });
  });
});

describe('a header being edited', () => {
  it('shows the page numbers it is told', () => {
    const doc = schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(null, [
        field('page-number'),
        schema.text('/'),
        field('page-count'),
      ]),
    ]);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [fieldNumbersPlugin()] }),
      nodeViews: FIELD_NODE_VIEWS,
    });
    expect(view.dom.textContent).toBe('1/1');
    setFieldNumbers(view, { number: 3, count: 5 });
    expect(view.dom.textContent).toBe('3/5');
    view.destroy();
  });
});
