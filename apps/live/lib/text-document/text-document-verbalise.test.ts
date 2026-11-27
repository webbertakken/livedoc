// docs/specs/034-text-documents/tools.md "Accessibility settings", What each says.
import { describe, expect, it } from 'vitest';
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { TextDocument, type TextDocumentThread } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import type { TextFormatting } from './text-document-formatting';
import {
  END_OF_DOCUMENT,
  NO_COLUMN_HEADER,
  NO_COMMENT_HERE,
  NO_ROW_HEADER,
  NOT_IN_A_TABLE,
  NOTHING_SELECTED,
  sayComment,
  sayCommentAnchor,
  sayCursorLocation,
  sayFormatting,
  sayFromCursor,
  saySelection,
  sayTableCell,
  sayTableHeaders,
  sayWordCount,
  VERBALISE_FROM_CURSOR_MAX_CHARS,
} from './text-document-verbalise';

const blank = TextDocument.blank({ format: 'odf' });
const formatting: TextFormatting = { styles: blank.styles, defaults: blank.defaults };
const mark = (name: string, attrs: Record<string, unknown>) => schema.marks[name]!.create(attrs);
const p = (text: string, marks: Mark[] = [], attrs: Record<string, unknown> = {}) =>
  schema.nodes.paragraph!.create(attrs, text ? schema.text(text, marks) : undefined);
const cell = (text: string) => schema.nodes.table_cell!.create(null, p(text));
const table = (rows: string[][]) =>
  schema.nodes.table!.create(
    null,
    rows.map((r) => schema.nodes.table_row!.create(null, r.map(cell))),
  );
const docOf = (...blocks: PmNode[]) => schema.nodes.doc!.create(null, blocks);

/** The position just before `text`'s first character, `offset` characters in. */
function at(doc: PmNode, text: string, offset = 0): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return;
    const index = node.text!.indexOf(text);
    if (index >= 0) found = pos + index + offset;
  });
  if (found < 0) throw new Error(`no ${text}`);
  return found;
}

const stateOf = (doc: PmNode, from: number, to = from) =>
  EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });

describe('saySelection', () => {
  it('says the selected text across paragraphs, white space run together', () => {
    const doc = docOf(p('one  two'), p('three'));
    expect(saySelection(stateOf(doc, at(doc, 'two'), at(doc, 'three', 5)))).toBe('two three');
  });

  it('says nothing is selected at a caret', () => {
    const doc = docOf(p('one'));
    expect(saySelection(stateOf(doc, 1))).toBe(NOTHING_SELECTED);
  });
});

describe('sayFromCursor', () => {
  it('reads from the caret to the end, through the paragraphs after', () => {
    const doc = docOf(p('one two'), p('three'));
    expect(sayFromCursor(stateOf(doc, at(doc, 'two')))).toBe('two three');
  });

  it('says the end of the document where nothing follows', () => {
    const doc = docOf(p('one'));
    expect(sayFromCursor(stateOf(doc, at(doc, 'one', 3)))).toBe(END_OF_DOCUMENT);
  });

  it('stops at a word before the bound', () => {
    const doc = docOf(p('word '.repeat(400)));
    const said = sayFromCursor(stateOf(doc, 1));
    expect(said.length).toBeLessThanOrEqual(VERBALISE_FROM_CURSOR_MAX_CHARS);
    expect(said.endsWith('word')).toBe(true);
  });

  it('cuts a bound-long word with no space at the bound', () => {
    const doc = docOf(p('x'.repeat(VERBALISE_FROM_CURSOR_MAX_CHARS + 50)));
    expect(sayFromCursor(stateOf(doc, 1))).toHaveLength(VERBALISE_FROM_CURSOR_MAX_CHARS);
  });
});

describe('sayCursorLocation', () => {
  it('says the page where laid out and the paragraph’s style', () => {
    const doc = docOf(p('one'));
    expect(sayCursorLocation(stateOf(doc, 1), formatting, { page: 2, pages: 5 })).toBe(
      'Page 2 of 5, Normal text',
    );
    expect(sayCursorLocation(stateOf(doc, 1), formatting, null)).toBe('Normal text');
  });

  it('says a list item’s level', () => {
    const doc = docOf(p('item', [], { list: { id: 'l1', level: 1 } }));
    expect(sayCursorLocation(stateOf(doc, 1), formatting, null)).toBe(
      'Normal text, List item, level 2',
    );
  });

  it('says the table cell', () => {
    const doc = docOf(
      table([
        ['a1', 'b1'],
        ['a2', 'b2'],
      ]),
    );
    expect(sayCursorLocation(stateOf(doc, at(doc, 'b2')), formatting, null)).toBe(
      'Normal text, Table, row 2, column 2',
    );
  });

  it('says styles are mixed across a selection of two', () => {
    const heading = blank.styles.find((s) => s.role === 'heading1')!;
    const doc = docOf(p('one'), p('two', [], { style: heading.id }));
    expect(sayCursorLocation(stateOf(doc, 1, at(doc, 'two', 2)), formatting, null)).toBe(
      'Mixed styles',
    );
  });
});

describe('sayFormatting', () => {
  it('says the font, size, what is on, a link and the alignment', () => {
    const marks = [
      mark('bold', { value: true }),
      mark('italic', { value: true }),
      mark('underline', { value: true }),
      mark('strike', { value: true }),
      mark('vertical', { value: 'super' }),
      mark('link', { href: 'https://example.com/a' }),
    ];
    const doc = docOf(p('word', marks, { props: { align: 'center' } }));
    const said = sayFormatting(stateOf(doc, 2), formatting);
    expect(said).toMatch(/^[^,]+, 11 point, bold, italic, underline, strikethrough, superscript/);
    expect(said).toContain('Link to example.com');
    expect(said.endsWith('Centred')).toBe(true);
  });

  it('says subscript, and a link it cannot read as written', () => {
    const doc = docOf(
      p('word', [mark('vertical', { value: 'sub' }), mark('link', { href: 'notes' })]),
    );
    const said = sayFormatting(stateOf(doc, 1, 3), formatting);
    expect(said).toContain('subscript');
    expect(said).toContain('Link to notes');
  });

  it('says what differs across the selection is mixed', () => {
    const doc = docOf(
      p('big', [mark('size', { value: 20 }), mark('font', { value: 'Lora' })], {
        props: { align: 'end' },
      }),
      p('small', [], { props: { align: 'justify' } }),
    );
    const said = sayFormatting(stateOf(doc, 1, at(doc, 'small', 3)), formatting);
    expect(said).toBe('Mixed font, Mixed size, Mixed alignment');
  });

  it('says each alignment', () => {
    const doc = docOf(
      p('a', [], { props: { align: 'end' } }),
      p('b', [], { props: { align: 'justify' } }),
      p('c'),
    );
    expect(sayFormatting(stateOf(doc, at(doc, 'a')), formatting)).toMatch(/Right aligned$/);
    expect(sayFormatting(stateOf(doc, at(doc, 'b')), formatting)).toMatch(/Justified$/);
    expect(sayFormatting(stateOf(doc, at(doc, 'c')), formatting)).toMatch(/Left aligned$/);
  });
});

describe('sayWordCount', () => {
  it('says the body’s words, one word, and a selection’s of them', () => {
    const doc = docOf(p('one two three'));
    expect(sayWordCount(doc, null)).toBe('3 words');
    expect(sayWordCount(docOf(p('one')), { from: 1, to: 1 })).toBe('1 word');
    expect(sayWordCount(doc, { from: 1, to: 8 })).toBe('2 of 3 words selected');
  });
});

describe('the table sayings', () => {
  const doc = docOf(
    p('before'),
    table([
      ['', 'Q1', 'Q2'],
      ['North', 'n1', 'n2'],
    ]),
  );

  it('says the cell and the table’s size', () => {
    expect(sayTableCell(stateOf(doc, at(doc, 'n2')))).toBe(
      'Row 2, column 3 of 2 rows and 3 columns',
    );
    const one = docOf(table([['x']]));
    expect(sayTableCell(stateOf(one, at(one, 'x')))).toBe('Row 1, column 1 of 1 row and 1 column');
  });

  it('says the headers beside and over the caret', () => {
    const state = stateOf(doc, at(doc, 'n2'));
    expect(sayTableHeaders(state, 'both')).toBe('Row header: North, Column header: Q2');
    expect(sayTableHeaders(state, 'row')).toBe('Row header: North');
    expect(sayTableHeaders(state, 'column')).toBe('Column header: Q2');
  });

  it('says there is no header in the header row and column, nor in an empty one', () => {
    expect(sayTableHeaders(stateOf(doc, at(doc, 'Q1')), 'both')).toBe(
      `${NO_ROW_HEADER}, ${NO_COLUMN_HEADER}`,
    );
    expect(sayTableHeaders(stateOf(doc, at(doc, 'North')), 'column')).toBe(NO_COLUMN_HEADER);
  });

  it('says the caret is not in a table', () => {
    const state = stateOf(doc, 1);
    expect(sayTableCell(state)).toBe(NOT_IN_A_TABLE);
    expect(sayTableHeaders(state, 'both')).toBe(NOT_IN_A_TABLE);
  });
});

describe('the comment sayings', () => {
  const doc = docOf(p('see the plan here'));
  const comment = (id: string, text: string, name: string) => ({
    id,
    text,
    at: 1,
    author: { name, colour: '#000' },
  });
  const thread = (comments: ReturnType<typeof comment>[]): TextDocumentThread => ({
    id: 't1',
    tab: 't',
    start: new Uint8Array(),
    end: new Uint8Array(),
    quote: 'the plan',
    resolved: false,
    comments,
  });
  const from = at(doc, 'the plan');
  const stretches = [{ id: 't1', from, to: from + 8, deleted: false }];

  it('says the thread’s first comment and its replies', () => {
    const one = { threads: [thread([comment('c1', 'Looks  good', 'Ada')])], stretches };
    expect(sayComment(stateOf(doc, from + 2), one)).toBe('Comment by Ada: Looks good');
    const three = {
      threads: [
        thread([comment('c1', 'Why?', 'Ada'), comment('c2', 'a', 'Bo'), comment('c3', 'b', 'Cy')]),
      ],
      stretches,
    };
    expect(sayComment(stateOf(doc, from + 2), three)).toBe('Comment by Ada: Why?, 2 replies');
    const two = {
      threads: [thread([comment('c1', 'Why?', 'Ada'), comment('c2', 'a', 'Bo')])],
      stretches,
    };
    expect(sayComment(stateOf(doc, from + 2), two)).toBe('Comment by Ada: Why?, 1 reply');
  });

  it('says the commented text', () => {
    const one = { threads: [thread([comment('c1', 'x', 'Ada')])], stretches };
    expect(sayCommentAnchor(stateOf(doc, from + 2), one)).toBe('the plan');
  });

  it('says there is no comment away from one, or for a thread it does not hold', () => {
    const one = { threads: [thread([comment('c1', 'x', 'Ada')])], stretches };
    expect(sayComment(stateOf(doc, 1), one)).toBe(NO_COMMENT_HERE);
    expect(sayCommentAnchor(stateOf(doc, 1), one)).toBe(NO_COMMENT_HERE);
    expect(sayComment(stateOf(doc, from + 2), { threads: [], stretches })).toBe(NO_COMMENT_HERE);
    expect(sayComment(stateOf(doc, from + 2), { threads: [thread([])], stretches })).toBe(
      NO_COMMENT_HERE,
    );
  });

  it('falls back to the quote where the stretch holds no text', () => {
    const empty = docOf(p('ab'));
    const one = {
      threads: [thread([comment('c1', 'x', 'Ada')])],
      stretches: [{ id: 't1', from: 1, to: 1, deleted: false }],
    };
    expect(sayCommentAnchor(stateOf(empty, 1), one)).toBe('the plan');
  });
});
