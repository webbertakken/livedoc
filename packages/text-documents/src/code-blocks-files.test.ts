// docs/specs/034-text-documents/objects.md "Code blocks": both formats hold a code block as a paragraph in a code
// style, its lines split by line breaks; the language travels as the style's name, the style carrying the code
// formatting itself and based on `Code`.
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import { Paragraph } from './model/blocks';
import { CODE_BLOCK_FONT, CODE_BLOCK_SHADING, CodeBlocks } from './model/code-blocks';
import { TextDocument } from './model/text-document';

describe.each([
  ['odf', 'fodt'],
  ['odf', 'odt'],
  ['ooxml', 'docx'],
] as const)('a code block in %s (%s)', (format, type) => {
  it('reads back as the same paragraph in the same code style', async () => {
    const blank = TextDocument.blank({ format });
    const base = CodeBlocks.style(format, null, blank.styles);
    const python = CodeBlocks.style(format, 'python', [...blank.styles, base]);
    const code: Paragraph = {
      type: 'paragraph',
      style: python.id,
      props: {},
      inlines: [{ type: 'run', text: 'def f(x):\n\treturn x  # one', props: {} }],
    };
    const document = { ...blank, styles: [...blank.styles, base, python], body: [code] };
    const written = writeTextDocumentFile(document, type);
    if (!written.ok) throw new Error(written.rejection);
    const read = await readTextDocumentFile(written.bytes);
    if (!read.ok) throw new Error(read.rejection);

    const [paragraph] = read.document.body.filter((b): b is Paragraph => b.type === 'paragraph');
    expect(Paragraph.text(paragraph!)).toBe('def f(x):\n\treturn x  # one');
    expect(CodeBlocks.of(read.document.styles, paragraph!.style)).toEqual({ language: 'python' });
    const style = read.document.styles.find((s) => s.id === paragraph!.style)!;
    expect(style.parent).toBe(base.id);
    expect(style.text).toMatchObject({ font: CODE_BLOCK_FONT, size: 10 });
    expect(style.paragraph).toMatchObject({ shading: CODE_BLOCK_SHADING, spaceBefore: 6 });
    expect(style.paragraph.borders?.top).toMatchObject({ color: CODE_BLOCK_SHADING, space: 4 });
  });
});
