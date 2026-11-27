// docs/specs/034-text-documents/review.md "Suggestion cards": each suggestion of the writing read as a card, in the
// writing's order, saying what it does one line per kind; the next and previous suggestion from the caret or the card.
import { describe, expect, it } from 'vitest';
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  cardLines,
  cardOffers,
  cardPartsOf,
  quoteOf,
  SUGGESTION_QUOTE_MAX,
  suggestionBeside,
  suggestionCards,
  storyCards,
} from './text-document-suggestion-cards';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };
const mark = (id: string, author: object = ADA, at = 5) => ({ id, at, author });

const p = (content: (string | PmNode)[], attrs: Record<string, unknown> = {}) =>
  schema.nodes.paragraph!.create(
    attrs,
    content.map((c) => (typeof c === 'string' ? schema.text(c) : c)),
  );
const text = (value: string, ...marks: Mark[]) => schema.text(value, marks);
const ins = (m: object) => schema.marks.insertion!.create(m);
const del = (m: object) => schema.marks.deletion!.create(m);
const fmt = (m: object, before: Record<string, unknown>) =>
  schema.marks.format_change!.create({ ...m, before });
const bold = () => schema.marks.bold!.create({ value: true });
const docOf = (...blocks: PmNode[]) => schema.nodes.doc!.create(null, blocks);

describe('suggestionCards', () => {
  it('reads an insertion as Add, with its author, time and stretch', () => {
    const doc = docOf(p(['The ', text('quick ', ins(mark('s1', ADA, 42))), 'fox']));
    expect(suggestionCards(doc)).toEqual([
      { id: 's1', from: 5, to: 11, at: 42, author: ADA, lines: ['Add: “quick ”'] },
    ]);
  });

  it('reads a deletion as Delete, and both in one suggestion as Replace', () => {
    const doc = docOf(
      p([
        text('dog', del(mark('s1'))),
        text('cat', ins(mark('s1'))),
        ' and ',
        text('gone', del(mark('s2', BEN))),
      ]),
    );
    const cards = suggestionCards(doc);
    expect(cards.map((c) => [c.id, c.lines])).toEqual([
      ['s1', ['Replace: “dog” with “cat”']],
      ['s2', ['Delete: “gone”']],
    ]);
    expect(cards[1]!.author).toEqual(BEN);
  });

  it('names what a format suggestion changed, in a fixed order, unknowns once', () => {
    const doc = docOf(
      p([text('a', bold(), fmt(mark('s1'), { italic: null, bold: null, odd: null, other: null }))]),
    );
    expect(suggestionCards(doc)[0]!.lines).toEqual(['Format: Bold, Italic, Text formatting']);
  });

  it('reads a break, a join and a paragraph format', () => {
    const doc = docOf(
      p(['one']),
      p(['two'], { insertion: mark('s1') }),
      p(['three'], { deletion: mark('s2') }),
      p(['four'], {
        formatChange: { ...mark('s3'), before: { style: null, props: null, list: null } },
      }),
    );
    expect(suggestionCards(doc).map((c) => c.lines)).toEqual([
      ['Add: Paragraph break'],
      ['Delete: Paragraph break'],
      ['Format: Paragraph'],
    ]);
  });

  it('names a page break, a column break and a horizontal line its break carries, each once', () => {
    const doc = docOf(
      p(['one']),
      p(['two'], { insertion: mark('s1'), props: { pageBreakBefore: true } }),
      p(['three'], { insertion: mark('s1'), props: { pageBreakBefore: true } }),
      p(['four'], { insertion: mark('s2'), props: { columnBreakBefore: true } }),
      p([], { insertion: mark('s3'), props: { borders: { bottom: { width: 1 } } } }),
      p(['five'], { insertion: mark('s3') }),
    );
    expect(suggestionCards(doc).map((c) => c.lines)).toEqual([
      ['Add: Page break'],
      ['Add: Column break'],
      ['Add: Horizontal line', 'Add: Paragraph break'],
    ]);
  });

  it('reads an object in a line by its name, once per verb', () => {
    const bookmark = (id: string) =>
      schema.nodes.bookmark!.create({ id, name: id, insertion: mark('s1') });
    const doc = docOf(p(['a', bookmark('b1'), bookmark('b2'), text('x', ins(mark('s1')))]));
    expect(suggestionCards(doc)[0]!.lines).toEqual(['Add: “x”', 'Add: Bookmark']);
  });

  // review.md "Whole blocks": a block's card names only the block, its split paragraph and bookmarks not listed.
  it('names only the block a suggestion puts in or takes out', () => {
    const table = schema.nodes.table!.create(
      { insertion: mark('s1') },
      schema.nodes.table_row!.create(null, schema.nodes.table_cell!.create(null, p(['in']))),
    );
    const doc = docOf(
      p(['ab', schema.nodes.bookmark!.create({ id: 'h', name: 'h', insertion: mark('s1') })]),
      table,
      p(['cd'], { insertion: mark('s1') }),
      schema.nodes.section_break!.create({ deletion: mark('s2', BEN) }),
    );
    const cards = suggestionCards(doc);
    expect(cards.map((c) => c.lines)).toEqual([['Add: Table'], ['Delete: Section break']]);
    expect(
      cardLines(
        cardPartsOf([
          { kind: 'block-insertion', text: 'table_of_contents' },
          { kind: 'block-deletion', text: 'table', element: 'table' },
          { kind: 'block-insertion', text: 'kept_block', element: 'kept_block' },
          { kind: 'break', text: '' },
        ]),
      ),
    ).toEqual(['Add: Table of contents', 'Delete: Table', 'Add: Object']);
  });

  // review.md "Suggestion cards" (director, 2026-11-26): a row's or column's card names it once, however many.
  it('names a row and a column once each, however many rows or cells', () => {
    const cell = (attrs: Record<string, unknown> = {}) =>
      schema.nodes.table_cell!.create(attrs, p(['x']));
    const table = schema.nodes.table!.create(null, [
      schema.nodes.table_row!.create(null, [cell(), cell({ deletion: mark('s2', BEN) })]),
      schema.nodes.table_row!.create({ insertion: mark('s1') }, [
        cell(),
        cell({ deletion: mark('s2', BEN) }),
      ]),
      schema.nodes.table_row!.create({ insertion: mark('s1') }, [
        cell(),
        cell({ deletion: mark('s2', BEN) }),
      ]),
    ]);
    expect(suggestionCards(docOf(p(['a']), table, p(['b']))).map((c) => c.lines)).toEqual([
      ['Delete: Column'],
      ['Add: Row'],
    ]);
    expect(
      cardLines(
        cardPartsOf([
          { kind: 'block-insertion', text: 'table_cell', element: 'table_cell' },
          { kind: 'block-insertion', text: 'table_header', element: 'table_header' },
        ]),
      ),
    ).toEqual(['Add: Column']);
  });

  it('keeps the parts of one suggestion across paragraphs as one card, from its first part', () => {
    const doc = docOf(
      p(['ab', text('cd', ins(mark('s1')))]),
      p([text('ef', ins(mark('s1')))], { insertion: mark('s1') }),
    );
    const [card] = suggestionCards(doc);
    expect(card).toMatchObject({ id: 's1', from: 3, to: 9 });
    expect(card!.lines).toEqual(['Add: “cdef”', 'Add: Paragraph break']);
  });

  it('skips a mark with no id or no author name', () => {
    const doc = docOf(
      p([
        text('a', ins({ id: '', at: 1, author: ADA })),
        text('b', del({ id: 's2', at: 1, author: {} })),
      ]),
    );
    expect(suggestionCards(doc)).toEqual([]);
  });

  it('lists cards in the order of their first part', () => {
    const doc = docOf(p([text('x', ins(mark('late'))), ' ', text('y', ins(mark('early')))]));
    expect(suggestionCards(doc).map((c) => c.id)).toEqual(['late', 'early']);
  });
});

describe('cardLines', () => {
  it('says nothing for no parts', () => {
    expect(cardLines([])).toEqual([]);
  });
});

describe('quoteOf', () => {
  it('folds whitespace and cuts long text with an ellipsis', () => {
    expect(quoteOf('a \n\t b')).toBe('a b');
    const long = 'x'.repeat(SUGGESTION_QUOTE_MAX + 5);
    expect(quoteOf(long)).toBe(`${'x'.repeat(SUGGESTION_QUOTE_MAX)}…`);
  });
});

describe('suggestionBeside', () => {
  const cards = [
    { id: 'a', from: 2 },
    { id: 'b', from: 10 },
    { id: 'c', from: 20 },
  ];
  it('steps from the selected card, never wrapping', () => {
    expect(suggestionBeside(cards, 'b', 0, true)).toBe('c');
    expect(suggestionBeside(cards, 'b', 0, false)).toBe('a');
    expect(suggestionBeside(cards, 'c', 0, true)).toBeNull();
  });
  it('steps from the caret with none selected', () => {
    expect(suggestionBeside(cards, null, 10, true)).toBe('c');
    expect(suggestionBeside(cards, null, 10, false)).toBe('a');
    expect(suggestionBeside(cards, null, 1, false)).toBeNull();
  });
  it('goes on from the body to its stories, comparing the caret with the body alone', () => {
    const withStories = [
      { id: 'a', from: 2 },
      { id: 'b', from: 10 },
      { id: 'h', from: 1, story: 'header-1' },
      { id: 'n', from: 1, story: 'note-1' },
    ];
    expect(suggestionBeside(withStories, null, 12, true)).toBe('h');
    expect(suggestionBeside(withStories, null, 5, true)).toBe('b');
    expect(suggestionBeside(withStories, null, 5, false)).toBe('a');
    expect(suggestionBeside(withStories, null, 1, false)).toBeNull();
    expect(suggestionBeside(withStories, 'h', 0, true)).toBe('n');
    expect(suggestionBeside(withStories, 'h', 0, false)).toBe('b');
  });
});

describe('storyCards', () => {
  const story = (...blocks: PmNode[]) => docOf(...blocks);
  it('reads each story in order, tagging its cards, skipping an id already read', () => {
    const header = story(p([text('Head', ins(mark('h1')))]));
    const note = story(p([text('Note', ins(mark('n1', BEN)))]), p([text('x', ins(mark('b1')))]));
    const cards = storyCards(
      [
        { story: 'header-1', doc: header },
        { story: 'note-1', doc: note },
      ],
      new Set(['b1']),
    );
    expect(cards.map((c) => [c.id, c.story, c.from])).toEqual([
      ['h1', 'header-1', 1],
      ['n1', 'note-1', 1],
    ]);
    expect(cards[1]!.author).toEqual(BEN);
  });
  it('reads a story shown twice once', () => {
    const header = story(p([text('Head', ins(mark('h1')))]));
    expect(
      storyCards(
        [
          { story: 'header-1', doc: header },
          { story: 'header-1', doc: header },
        ],
        new Set(),
      ).map((c) => c.id),
    ).toEqual(['h1']);
  });
});

describe('cardOffers', () => {
  const ada = { author: ADA };
  const file = { author: { name: 'Word', colour: '#64748b', fromFile: true as const } };
  it('offers an Editor both on every suggestion, a file’s too', () => {
    const rights = { accepts: true, ownKey: 'k-ben' };
    expect(cardOffers(ada, rights)).toEqual({ accept: true, reject: true });
    expect(cardOffers(file, rights)).toEqual({ accept: true, reject: true });
  });
  it('offers a Participant Reject on their own alone', () => {
    expect(cardOffers(ada, { accepts: false, ownKey: 'k-ada' })).toEqual({
      accept: false,
      reject: true,
    });
    expect(cardOffers(ada, { accepts: false, ownKey: 'k-ben' })).toEqual({
      accept: false,
      reject: false,
    });
    expect(cardOffers(file, { accepts: false, ownKey: 'k-ben' })).toEqual({
      accept: false,
      reject: false,
    });
  });
  it('offers a Viewer nothing', () => {
    expect(cardOffers(ada, { accepts: false, ownKey: null })).toEqual({
      accept: false,
      reject: false,
    });
  });
});

describe('cardPartsOf', () => {
  it('reads the live state’s parts as a card’s, so the panel says what the card says', () => {
    const parts = cardPartsOf([
      { kind: 'deletion', text: 'dog' },
      { kind: 'insertion', text: 'cat' },
      { kind: 'format', text: 'x', changed: ['italic'] },
      { kind: 'insertion', text: 'picture', element: 'picture' },
      { kind: 'break', text: '' },
      { kind: 'break', text: '', breakKind: 'page' },
      { kind: 'join', text: '' },
      { kind: 'paragraph-format', text: '' },
    ]);
    expect(cardLines(parts)).toEqual([
      'Replace: “dog” with “cat”',
      'Format: Italic',
      'Add: Picture',
      'Add: Page break',
      'Add: Paragraph break',
      'Delete: Paragraph break',
      'Format: Paragraph',
    ]);
  });

  it('reads a drawing put in as Add: Drawing, and one replaced in one suggestion as Replace: Drawing', () => {
    const drawing = (kind: 'insertion' | 'deletion') =>
      ({ kind, text: 'picture', element: 'drawing' }) as const;
    expect(cardLines(cardPartsOf([drawing('insertion')]))).toEqual(['Add: Drawing']);
    expect(cardLines(cardPartsOf([drawing('deletion'), drawing('insertion')]))).toEqual([
      'Replace: Drawing',
    ]);
  });

  it('reads a drawing’s picture in the writing as a drawing', () => {
    const picture = (attrs: Record<string, unknown>) =>
      schema.nodes.picture!.create({ media: 'm1', ...attrs });
    const doc = docOf(
      p([
        picture({ drawing: 'd-old', deletion: mark('s1') }),
        picture({ drawing: 'd-new', insertion: mark('s1') }),
      ]),
    );
    expect(suggestionCards(doc).map((c) => c.lines)).toEqual([['Replace: Drawing']]);
  });

  it('reads a format part with no names as Text formatting', () => {
    expect(cardLines(cardPartsOf([{ kind: 'format', text: 'x' }]))).toEqual([
      'Format: Text formatting',
    ]);
  });
});
