// docs/specs/034-text-documents/objects.md "Code blocks": a code block is one paragraph in a code style; `Code` is a
// block of no language, `Code (<Language>)` names one of Google's list, its style carrying the code formatting itself;
// another name in the brackets reads as no language.
import { describe, expect, it } from 'vitest';
import {
  CODE_BLOCK_FONT,
  CODE_BLOCK_LANGUAGES,
  CODE_BLOCK_SHADING,
  CodeBlocks,
  odfStyleName,
} from './code-blocks';
import type { Style } from './styles';

const style = (id: string, name: string): Style => ({
  id,
  name,
  family: 'paragraph',
  paragraph: {},
  text: {},
});

describe('CODE_BLOCK_LANGUAGES', () => {
  it('lists Google’s languages in its order', () => {
    expect(CODE_BLOCK_LANGUAGES.map((l) => l.label)).toEqual([
      'C/C++',
      'CSharp',
      'CSS',
      'Go',
      'HTML',
      'Java',
      'JavaScript',
      'JSON',
      'Kotlin',
      'PHP',
      'Protobuf',
      'Python',
      'Rust',
      'Shell',
      'SQL',
      'Textproto',
      'TypeScript',
      'XML',
    ]);
  });
});

describe('CodeBlocks.languageOfName', () => {
  it('reads `Code` as a block of no language and `Code (<Language>)` as that language', () => {
    expect(CodeBlocks.languageOfName('Code')).toBeNull();
    expect(CodeBlocks.languageOfName('Code (Python)')).toBe('python');
    expect(CodeBlocks.languageOfName('Code (C/C++)')).toBe('c');
  });

  it('reads an unknown language as no language, and any other name as no code', () => {
    expect(CodeBlocks.languageOfName('Code (Cobol)')).toBeNull();
    expect(CodeBlocks.languageOfName('Codex')).toBeUndefined();
    expect(CodeBlocks.languageOfName('Normal')).toBeUndefined();
  });
});

describe('CodeBlocks.of', () => {
  it('finds a paragraph’s code block by its style’s name', () => {
    const styles = [style('CodePython', 'Code (Python)'), style('Heading1', 'heading 1')];
    expect(CodeBlocks.of(styles, 'CodePython')).toEqual({ language: 'python' });
    expect(CodeBlocks.of(styles, 'Heading1')).toBeUndefined();
    expect(CodeBlocks.of(styles, null)).toBeUndefined();
    expect(CodeBlocks.of(styles, 'Missing')).toBeUndefined();
  });
});

describe('CodeBlocks.style', () => {
  it('names a language’s style for it, based on `Code`, carrying the code formatting itself', () => {
    const made = CodeBlocks.style('ooxml', 'python', []);
    expect(made).toMatchObject({
      id: 'CodePython',
      name: 'Code (Python)',
      family: 'paragraph',
      parent: 'Code',
      text: { font: CODE_BLOCK_FONT, size: 10 },
      paragraph: { shading: CODE_BLOCK_SHADING, spaceBefore: 6, spaceAfter: 6 },
    });
    expect(made.paragraph.borders?.left).toEqual({
      width: 1,
      dash: 'solid',
      color: CODE_BLOCK_SHADING,
      space: 4,
    });
  });

  it('writes ODF names escaped as its suites write them', () => {
    expect(odfStyleName('Code (C/C++)')).toBe('Code_20__28_C_2f_C_2b__2b__29_');
    expect(CodeBlocks.style('odf', 'python', []).id).toBe('Code_20__28_Python_29_');
    expect(CodeBlocks.style('odf', null, []).id).toBe('Code');
  });

  it('takes a free id when another style holds the name’s', () => {
    expect(CodeBlocks.style('ooxml', 'go', [style('CodeGo', 'Something else')]).id).toBe('CodeGo2');
  });

  it('finds the document’s own style for a language before making one', () => {
    const held = style('MyCode', 'Code (Rust)');
    expect(CodeBlocks.held([held], 'rust')).toBe(held);
    expect(CodeBlocks.held([held], 'go')).toBeUndefined();
  });
});
