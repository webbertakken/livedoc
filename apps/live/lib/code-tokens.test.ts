// docs/specs/034-text-documents/objects.md "Code blocks": highlighting colours keywords, strings, comments and numbers
// in each of Google's languages; docs/specs/009-elements/code-block.md: the canvas code block's tokenizer, shared.
import { describe, expect, it } from 'vitest';
import { codeTokenRanges, tokenizeCode, type TokenLanguage } from './code-tokens';
import { MORE_TOKEN_LANGUAGES } from './code-token-languages';

const kinds = (code: string, language: TokenLanguage) =>
  codeTokenRanges(code, language).map(({ from, to, kind }) => [code.slice(from, to), kind]);

describe('codeTokenRanges', () => {
  it('places each token by its offsets across lines, plain text left out', () => {
    expect(kinds('def f(x):\n  return 1 # one', 'python')).toEqual([
      ['def', 'keyword'],
      ['return', 'keyword'],
      ['1', 'number'],
      ['# one', 'comment'],
    ]);
  });

  it('carries a block comment over lines', () => {
    expect(kinds('a /* b\nc */ d', 'c')).toEqual([
      ['/* b', 'comment'],
      ['c */', 'comment'],
    ]);
  });

  it('reads plain text as no tokens', () => {
    expect(codeTokenRanges('if (a) "b"', 'plain')).toEqual([]);
  });
});

describe('the code blocks’ further languages', () => {
  it.each([
    ['c', 'int main() { return 0; } // done', ['int', 'return', '0', '// done']],
    ['csharp', 'public class A { string s = "x"; }', ['public', 'class', 'string', '"x"']],
    ['go', 'func main() { x := `raw` }', ['func', '`raw`']],
    ['java', 'final var n = 42; /* c */', ['final', 'var', '42', '/* c */']],
    ['kotlin', 'val name = "k" // c', ['val', '"k"', '// c']],
    ['php', 'function f() { echo "hi"; }', ['function', 'echo', '"hi"']],
    ['rust', 'fn main() { let mut x = 1; }', ['fn', 'let', 'mut', '1']],
    ['protobuf', 'message A { int32 id = 1; }', ['message', 'int32', '1']],
    ['textproto', 'name: "a" # c', ['"a"', '# c']],
    ['xml', '<a href="x"><!-- c --></a>', ['a', '"x"', '<!-- c -->', 'a']],
  ] as const)('highlights %s', (language, code, expected) => {
    expect(MORE_TOKEN_LANGUAGES).toContain(language);
    expect(kinds(code, language).map(([text]) => text)).toEqual(expected);
  });

  it('keeps every character in its line’s tokens', () => {
    const code = 'let x = "a"; // b';
    expect(
      tokenizeCode(code, 'rust')
        .flat()
        .map((t) => t.text)
        .join(''),
    ).toBe(code);
  });
});
