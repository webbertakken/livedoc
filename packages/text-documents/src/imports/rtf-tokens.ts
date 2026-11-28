// Rich Text's tokens (docs/specs/034-text-documents/files-and-print.md "Opening"): groups, control words with their
// number, control symbols, a byte written in hex, raw bytes after `\binN`, and text. A control word's delimiting space
// is part of it; carriage returns and line feeds are not text, as RTF asks.

export type RtfToken =
  | { readonly kind: 'open' }
  | { readonly kind: 'close' }
  | { readonly kind: 'word'; readonly name: string; readonly param?: number }
  | { readonly kind: 'symbol'; readonly char: string }
  | { readonly kind: 'hex'; readonly byte: number }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'text'; readonly text: string };

const LETTER = /[a-z]/i;
const DIGIT = /[0-9]/;

/** The tokens of a file read as Latin-1 (one character a byte). */
export function* rtfTokens(source: string): Generator<RtfToken> {
  let i = 0;
  let text = '';
  const flush = function* (): Generator<RtfToken> {
    if (text) yield { kind: 'text', text };
    text = '';
  };
  while (i < source.length) {
    const char = source[i]!;
    if (char === '{' || char === '}') {
      yield* flush();
      yield { kind: char === '{' ? 'open' : 'close' };
      i += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      i += 1;
      continue;
    }
    if (char !== '\\') {
      text += char;
      i += 1;
      continue;
    }
    yield* flush();
    const next = source[i + 1] ?? '';
    if (next === "'") {
      const byte = parseInt(source.slice(i + 2, i + 4), 16);
      if (Number.isFinite(byte)) yield { kind: 'hex', byte };
      i += 4;
      continue;
    }
    if (!LETTER.test(next)) {
      // `\` before a line break is a paragraph end, as `\par`.
      if (next === '\r' || next === '\n') yield { kind: 'word', name: 'par' };
      else yield { kind: 'symbol', char: next };
      i += 2;
      continue;
    }
    let end = i + 1;
    while (end < source.length && LETTER.test(source[end]!)) end += 1;
    const name = source.slice(i + 1, end);
    let digits = '';
    if (source[end] === '-' && DIGIT.test(source[end + 1] ?? '')) {
      digits = '-';
      end += 1;
    }
    while (end < source.length && DIGIT.test(source[end]!)) digits += source[end++];
    if (source[end] === ' ') end += 1;
    const param = digits ? Number(digits) : undefined;
    i = end;
    if (name === 'bin' && param !== undefined && param > 0) {
      const bytes = new Uint8Array(param);
      for (let b = 0; b < param && i + b < source.length; b += 1)
        bytes[b] = source.charCodeAt(i + b) & 0xff;
      i += param;
      yield { kind: 'bytes', bytes };
      continue;
    }
    yield param === undefined ? { kind: 'word', name } : { kind: 'word', name, param };
  }
  yield* flush();
}
