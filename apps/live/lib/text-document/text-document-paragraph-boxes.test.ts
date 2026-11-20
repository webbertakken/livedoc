// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Borders and shading": adjacent paragraphs with the same
// borders, padding and background share one box.
import { describe, expect, it } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TextDocument, type ParagraphProps, type Style } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { paragraphBoxesPlugin, paragraphBoxJoins } from './text-document-paragraph-boxes';

const blank = TextDocument.blank({ format: 'odf' });
const formatting = { styles: blank.styles, defaults: blank.defaults };
const line = { width: 1, dash: 'solid' as const, color: '#000000', space: 4 };
const boxed: ParagraphProps = { borders: { top: line, bottom: line }, spaceAfter: 6 };
const p = (text: string, props: ParagraphProps | null = null, style: string | null = null) =>
  schema.nodes.paragraph!.create({ props, style }, schema.text(text));
const docOf = (...paragraphs: PmNode[]) => schema.node('doc', null, paragraphs);

const joins = (doc: PmNode, f = formatting) =>
  paragraphBoxJoins(doc, f)
    .find()
    .map((d) => [
      d.from,
      (d as unknown as { type: { attrs: { class: string } } }).type.attrs.class,
    ]);

describe('paragraphBoxJoins', () => {
  it('joins adjacent paragraphs drawing the same box, a run of three through its middle', () => {
    const doc = docOf(p('a', boxed), p('b', boxed), p('c', boxed), p('d'));
    expect(joins(doc)).toEqual([
      [0, 'text-document-box-joined-below'],
      [3, 'text-document-box-joined-above'],
      [3, 'text-document-box-joined-below'],
      [6, 'text-document-box-joined-above'],
    ]);
  });

  it('joins nothing between different boxes, or no box', () => {
    const shaded: ParagraphProps = { shading: '#fff2cc' };
    expect(joins(docOf(p('a', boxed), p('b', shaded), p('c'), p('d')))).toEqual([]);
  });

  it("reads a box a paragraph's style gives it", () => {
    const styles: Style[] = blank.styles.map((s) =>
      s.role === 'heading1' ? { ...s, paragraph: { ...s.paragraph, shading: '#cfe2f3' } } : s,
    );
    const h1 = blank.styles.find((s) => s.role === 'heading1')!.id;
    expect(
      joins(docOf(p('a', null, h1), p('b', null, h1)), { ...formatting, styles }),
    ).toHaveLength(2);
  });

  it("draws Between's line under the upper paragraph, and the space between inside the box", () => {
    const between: ParagraphProps = {
      ...boxed,
      borders: { ...boxed.borders, between: { ...line, dash: 'dashed' } },
    };
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: docOf(p('a', between), p('b', between)),
        plugins: [paragraphBoxesPlugin(() => formatting)],
      }),
    });
    const [upper, lower] = [...view.dom.querySelectorAll('p')];
    expect(upper!.style.borderBottomStyle).toBe('dashed');
    expect(upper!.style.borderBottom).toContain('light-dark(rgb(0, 0, 0)');
    expect(upper!.style.paddingBottom).toBe('6pt');
    expect(upper!.style.marginBottom).toBe('0px');
    expect(lower!.style.borderTopStyle).toBe('none');
    // A change to the writing works them out again.
    view.dispatch(view.state.tr.setNodeMarkup(3, undefined, { props: null, style: null }));
    expect(view.dom.querySelector('.text-document-box-joined-below')).toBeNull();
    view.destroy();
  });
});
