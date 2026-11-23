// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Equations in the editor": an equation is one character to the caret, drawn
// as MathML in its run's formatting, an empty one as a dotted box, copied as its linear form.
import { describe, expect, it } from 'vitest';
import { DOMSerializer } from 'prosemirror-model';
import type { MathRow } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';

const MATHML = 'http://www.w3.org/1998/Math/MathML';
const A_OVER_B: MathRow = [
  {
    kind: 'fraction',
    numerator: [{ kind: 'identifier', text: 'a' }],
    denominator: [{ kind: 'identifier', text: 'b' }],
  },
];

const draw = (attrs: Record<string, unknown>) => {
  const node = textDocumentSchema.nodes.equation!.create(attrs);
  return {
    node,
    dom: DOMSerializer.fromSchema(textDocumentSchema).serializeNode(node) as HTMLElement,
  };
};

describe('an equation in the editor', () => {
  it('draws its maths as MathML inside a span the caret steps over', () => {
    const { dom, node } = draw({ math: A_OVER_B, props: { size: 14, color: '#1155cc' } });
    expect(dom.tagName).toBe('SPAN');
    expect(dom.className).toBe('text-document-equation');
    expect(dom.getAttribute('contenteditable')).toBe('false');
    expect(dom.style.fontSize).toBe('14pt');
    const math = dom.firstElementChild!;
    expect(math.namespaceURI).toBe(MATHML);
    expect(math.localName).toBe('math');
    expect(math.querySelector('mfrac')?.namespaceURI).toBe(MATHML);
    expect(node.isAtom && node.nodeSize).toBe(1);
  });

  it('copies as its linear form', () => {
    const { node } = draw({ math: A_OVER_B });
    const p = textDocumentSchema.nodes.paragraph!.create(null, [
      textDocumentSchema.text('So '),
      node,
    ]);
    expect(p.textBetween(0, p.content.size, '', (leaf) => leaf.type.spec.leafText!(leaf))).toBe(
      'So a/b',
    );
  });

  it('draws an empty equation, or maths it cannot hold, as an empty dotted box', () => {
    expect(draw({ math: [] }).dom.dataset.empty).toBe('true');
    expect(draw({ math: [{ kind: 'matrix' }] }).dom.dataset.empty).toBe('true');
    expect(draw({ math: A_OVER_B }).dom.dataset.empty).toBeUndefined();
  });
});
