import { describe, expect, it } from 'vitest';
import { parseTextOps } from './parse';
import { TEXT_OPS_MAX, TEXT_OPS_MAX_CHARS } from './text-ops';

const ops = (text: string) => {
  const parsed = parseTextOps(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.ops.map((o) => ({ suggest: o.suggest, ...o.op }));
};

const refusal = (text: string) => {
  const parsed = parseTextOps(text);
  if (parsed.ok) throw new Error('read');
  return {
    line: parsed.line,
    operation: parsed.operation,
    message: parsed.message,
    error: parsed.error,
  };
};

describe('parseTextOps', () => {
  it('reads every operation, skipping blank lines and comments', () => {
    const text = [
      '# tighten the intro',
      'edit "Hello" "Hi **there**"',
      '',
      'insert after ¶3 "## Next\\n\\nMore."',
      'insert before p2 "A line."',
      'insert after "the end" "x"',
      'append "Tail"',
      'prepend "Head"',
      'style ¶4 "Heading 2"',
      'format "word" bold -italic underline -strike link=https://example.com -link',
      'format "w" link="https://a.b/c d"',
      'table ¶20 add-row 0',
      'table "cell" delete-row 2',
      'table ¶20 add-column 1',
      'table ¶20 delete-column 3',
      'table ¶20 set 2,3 "text"',
      'comment "word" "Why?"',
      'suggest edit "a" "b"',
      "suggest format 'w' bold",
    ].join('\r\n');
    expect(ops(text)).toEqual([
      { suggest: false, op: 'edit', old: 'Hello', text: 'Hi **there**' },
      {
        suggest: false,
        op: 'insert',
        where: 'after',
        target: { kind: 'paragraph', n: 3 },
        markdown: '## Next\n\nMore.',
      },
      {
        suggest: false,
        op: 'insert',
        where: 'before',
        target: { kind: 'paragraph', n: 2 },
        markdown: 'A line.',
      },
      {
        suggest: false,
        op: 'insert',
        where: 'after',
        target: { kind: 'text', text: 'the end' },
        markdown: 'x',
      },
      { suggest: false, op: 'append', markdown: 'Tail' },
      { suggest: false, op: 'prepend', markdown: 'Head' },
      { suggest: false, op: 'style', target: { kind: 'paragraph', n: 4 }, style: 'Heading 2' },
      {
        suggest: false,
        op: 'format',
        old: 'word',
        marks: [
          { mark: 'bold', on: true },
          { mark: 'italic', on: false },
          { mark: 'underline', on: true },
          { mark: 'strike', on: false },
          { mark: 'link', href: 'https://example.com' },
          { mark: 'link', href: null },
        ],
      },
      {
        suggest: false,
        op: 'format',
        old: 'w',
        marks: [{ mark: 'link', href: 'https://a.b/c d' }],
      },
      {
        suggest: false,
        op: 'table',
        target: { kind: 'paragraph', n: 20 },
        action: { action: 'add-row', n: 0 },
      },
      {
        suggest: false,
        op: 'table',
        target: { kind: 'text', text: 'cell' },
        action: { action: 'delete-row', n: 2 },
      },
      {
        suggest: false,
        op: 'table',
        target: { kind: 'paragraph', n: 20 },
        action: { action: 'add-column', n: 1 },
      },
      {
        suggest: false,
        op: 'table',
        target: { kind: 'paragraph', n: 20 },
        action: { action: 'delete-column', n: 3 },
      },
      {
        suggest: false,
        op: 'table',
        target: { kind: 'paragraph', n: 20 },
        action: { action: 'set', row: 2, column: 3, text: 'text' },
      },
      { suggest: false, op: 'comment', old: 'word', text: 'Why?' },
      { suggest: true, op: 'edit', old: 'a', text: 'b' },
      { suggest: true, op: 'format', old: 'w', marks: [{ mark: 'bold', on: true }] },
    ]);
  });

  it('reads replace, alone, with empty Markdown allowed', () => {
    expect(ops('replace ""')).toEqual([{ suggest: false, op: 'replace', markdown: '' }]);
  });

  it('names the line and operation of the first line that does not read', () => {
    expect(refusal('# note\nedit "a" "b"\n\nedit a "b"')).toEqual({
      error: 'invalid_operation',
      line: 4,
      operation: 2,
      message: 'the text to change as a quoted text: edit "old" "new"',
    });
  });

  it.each([
    [
      'frobnicate',
      'an operation: edit, insert, append, prepend, style, format, table, comment, replace, each may follow suggest',
    ],
    [
      'suggest frobnicate',
      'an operation: edit, insert, append, prepend, style, format, table, comment, replace',
    ],
    [
      '"edit"',
      'an operation: edit, insert, append, prepend, style, format, table, comment, replace, each may follow suggest',
    ],
    [
      'suggest comment "a" "b"',
      'suggest comes before edit, insert, append, prepend, format; not comment',
    ],
    [
      'suggest style ¶1 "Title"',
      'suggest comes before edit, insert, append, prepend, format; not style',
    ],
    ['edit "" "b"', 'the text to change, not empty: edit "old" "new"'],
    [
      'edit "a" "b\\nc"',
      'the new text within one paragraph (insert adds paragraphs): edit "old" "new"',
    ],
    ['edit "a" "b" "c"', 'nothing more on the line: edit "old" "new"'],
    ['edit "a', 'column 6: expected a closing "'],
    ['insert under ¶1 "x"', 'after or before: insert after|before <¶n or "text"> "<markdown>"'],
    ['insert "after" ¶1 "x"', 'after or before: insert after|before <¶n or "text"> "<markdown>"'],
    [
      'insert after ¶0 "x"',
      'a target: a paragraph number (¶12 or p12) or a quoted text: insert after|before <¶n or "text"> "<markdown>"',
    ],
    [
      'insert after x12 "x"',
      'a target: a paragraph number (¶12 or p12) or a quoted text: insert after|before <¶n or "text"> "<markdown>"',
    ],
    [
      'insert after ¶1a "x"',
      'a target: a paragraph number (¶12 or p12) or a quoted text: insert after|before <¶n or "text"> "<markdown>"',
    ],
    [
      'insert after ¶1',
      'the Markdown as a quoted text: insert after|before <¶n or "text"> "<markdown>"',
    ],
    ['append ""', 'the Markdown, not empty: append "<markdown>"'],
    ['style ¶1', 'the style as a quoted text: style <¶n or "text"> "<style>"'],
    [
      'format "a"',
      'at least one mark: format "old" bold|italic|underline|strike|-bold|…|link=<url>|-link …',
    ],
    [
      'format "a" shiny',
      'a mark: bold, italic, underline, strike, each -bold to take it off, link=<url> or -link: format "old" bold|italic|underline|strike|-bold|…|link=<url>|-link …',
    ],
    [
      'format "a" "bold"',
      'a mark: bold, italic, underline, strike, each -bold to take it off, link=<url> or -link: format "old" bold|italic|underline|strike|-bold|…|link=<url>|-link …',
    ],
    [
      'format "a" link=',
      'link=<url>: an address: format "old" bold|italic|underline|strike|-bold|…|link=<url>|-link …',
    ],
    [
      'table ¶1 spin 2',
      expect.stringContaining(
        'a table operation: add-row, delete-row, add-column, delete-column or set',
      ),
    ],
    [
      'table ¶1 add-row',
      expect.stringContaining('after which (0 for first), a whole number from 0'),
    ],
    ['table ¶1 delete-row 0', expect.stringContaining('which, a whole number from 1')],
    ['table ¶1 delete-row "1"', expect.stringContaining('which, a whole number from 1')],
    ['table ¶1 add-row 1 2', expect.stringContaining('nothing after add-row 1')],
    ['table ¶1 set 0,1 "x"', expect.stringContaining('set <row>,<column>: a cell, counted from 1')],
    ['table ¶1 set 1 "x"', expect.stringContaining('set <row>,<column>: a cell, counted from 1')],
    [
      'table ¶1 set "1,1" "x"',
      expect.stringContaining('set <row>,<column>: a cell, counted from 1'),
    ],
    ['table ¶1 set 1,1', expect.stringContaining('the cell’s text as a quoted text')],
    ['table ¶1 set 1,1 "x" y', expect.stringContaining('nothing after the cell’s text')],
    ['comment "a" ""', 'the comment, not empty: comment "old" "text"'],
    ['replace', 'the Markdown as a quoted text: replace "<markdown>"'],
  ])('refuses %s', (text, message) => {
    expect(refusal(text).message).toEqual(message);
  });

  it('refuses replace beside another operation', () => {
    expect(refusal('edit "a" "b"\nreplace "x"')).toMatchObject({
      line: 2,
      operation: 2,
      message: 'replace stands alone in its changeset',
    });
  });

  it('refuses no operations, too many, and too much text', () => {
    expect(refusal('# nothing\n\n').message).toBe('at least one operation');
    expect(
      refusal(Array.from({ length: TEXT_OPS_MAX + 1 }, () => 'append "x"').join('\n')).message,
    ).toBe(`at most ${TEXT_OPS_MAX} operations; ${TEXT_OPS_MAX + 1} given`);
    expect(refusal(`append "${'x'.repeat(TEXT_OPS_MAX_CHARS)}"`)).toMatchObject({
      line: 0,
      message: `at most ${TEXT_OPS_MAX_CHARS} characters of operations`,
    });
  });
});
