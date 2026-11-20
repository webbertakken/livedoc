import { describe, expect, it } from 'vitest';
import { TextDocument, type Style } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import { textDocumentHeadings } from './text-document-outline';

const STYLES: readonly Style[] = [
  ...TextDocument.blank({ format: 'odf' }).styles,
  // A style of the file's own, based on Heading 2: a heading through its parent.
  {
    id: 'Chapter',
    name: 'Chapter',
    family: 'paragraph',
    parent: 'Heading_20_2',
    paragraph: {},
    text: {},
  },
];

const { paragraph, kept_inline: kept } = textDocumentSchema.nodes;
const p = (text: string, attrs: Record<string, unknown> = {}) =>
  paragraph!.create(attrs, text ? textDocumentSchema.text(text) : null);
const doc = (...blocks: ReturnType<typeof p>[]) => textDocumentSchema.node('doc', null, blocks);

// docs/specs/034-text-documents/links-and-navigation.md "The outline".
describe('textDocumentHeadings', () => {
  it('lists the paragraphs with an outline level, by their style, in order', () => {
    const body = doc(
      p('Intro', { style: 'Heading_20_1' }),
      p('Plain words'),
      p('Detail', { style: 'Heading_20_3' }),
      p('Normal', { style: 'Standard' }),
    );
    expect(textDocumentHeadings(body, STYLES)).toEqual([
      { level: 1, text: 'Intro', pos: 1 },
      { level: 3, text: 'Detail', pos: 21 },
    ]);
  });

  it('reads a level through the style’s parents, and a paragraph’s own level first', () => {
    const body = doc(
      p('Chapter one', { style: 'Chapter' }),
      p('Own', { props: { outlineLevel: 4 } }),
    );
    expect(textDocumentHeadings(body, STYLES).map((h) => h.level)).toEqual([2, 4]);
  });

  it('leaves out levels past six, and names an empty heading', () => {
    const body = doc(p('Deep', { props: { outlineLevel: 8 } }), p('', { style: 'Heading_20_1' }));
    expect(textDocumentHeadings(body, STYLES)).toEqual([
      { level: 1, text: 'Untitled heading', pos: 7 },
    ]);
  });

  it('reads only the text of a heading, never what is kept from the file', () => {
    const heading = paragraph!.create({ style: 'Heading_20_1' }, [
      textDocumentSchema.text('Plan '),
      kept!.create({ name: 'text:bookmark' }),
      textDocumentSchema.text('B'),
    ]);
    expect(textDocumentHeadings(doc(heading), STYLES)[0]!.text).toBe('Plan B');
  });
});
