// review.md "Compare documents" ("What is compared"): the primary with every difference from the selected as a
// suggestion; rejecting every one reads as the primary, accepting every one as the selected; bounded.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { Block, Inline, Paragraph, Run } from '../model/blocks';
import type { Table, TableRow } from '../model/tables';
import type { TextProps } from '../model/props';
import type { FileThread } from '../model/comments';
import { TextDocument } from '../model/text-document';
import { DocumentTabs, type DocumentTab } from '../model/document-tabs';
import { Suggestions } from '../model/suggestions';
import { writeLiveDocument } from '../live/live-write';
import { readLiveDocument } from '../live/live-read';
import { LiveSuggestions } from '../live/live-suggestions';
import {
  TEXT_DOCUMENT_COMPARE_BUDGET_MS,
  TEXT_DOCUMENT_COMPARE_TOKENS_MAX,
  TextDocumentComparison,
  type ComparisonResult,
} from './compare-documents';

const NAME = 'Reviewer';
const AT = 1_700_000_000_000;

const run = (text: string, props: TextProps = {}, link?: string): Run => ({
  type: 'run',
  text,
  props,
  ...(link ? { link } : {}),
});
const para = (inlines: Inline[] | string, style = 'P'): Paragraph => ({
  type: 'paragraph',
  style,
  props: {},
  inlines: typeof inlines === 'string' ? (inlines ? [run(inlines)] : []) : inlines,
});
const row = (...cells: string[]): TableRow => ({
  cells: cells.map((text) => ({ blocks: [para(text)], props: {} })),
});
const table = (...rows: TableRow[]): Table => ({
  type: 'table',
  columns: rows[0]!.cells.map(() => 100),
  rows,
  headerRows: 0,
});

const blank = TextDocument.blank();
const normal = blank.body[0]!.type === 'paragraph' ? blank.body[0]!.style : 'P';
const doc = (...body: Block[]): TextDocument => ({ ...blank, body });
const tabbed = (...tabs: Block[][]): TextDocument =>
  DocumentTabs.withAll(
    blank,
    tabs.map((body, k): DocumentTab => ({ id: `t.${k}`, name: `Tab ${k + 1}`, depth: 0, body })),
  );

function compared(primary: TextDocument, selected: TextDocument, comments = false): TextDocument {
  const result = TextDocumentComparison.compare(primary, selected, {
    name: NAME,
    at: AT,
    comments,
  });
  if (!result.ok) throw new Error(`refused ${result.refusal}`);
  return result.document;
}

/** A body as it reads: paragraphs' text with deletions kept, each suggestion's kinds beside it. */
const inlineText = (i: Inline): string =>
  i.type === 'run' || i.type === 'field' ? i.text : i.type === 'comment' ? '' : `{${i.type}}`;

/** How a document reads, tab by tab: each paragraph's text, a table as its rows of cells. */
function reading(document: TextDocument): string {
  const blocks = (list: readonly Block[]): string =>
    list
      .map((b) =>
        b.type === 'paragraph'
          ? b.inlines.map(inlineText).join('')
          : b.type === 'table'
            ? `[${b.rows.map((r) => r.cells.map((c) => blocks(c.blocks)).join('|')).join('/')}]`
            : `<${b.type}>`,
      )
      .join('¶');
  return DocumentTabs.all(document)
    .map((t) => blocks(t.body))
    .join(' ⇥ ');
}

/** The comparison written live, then every suggestion settled one way, read back. */
function settled(comparison: TextDocument, accept: boolean): TextDocument {
  const live = new Y.Doc();
  writeLiveDocument(live, comparison);
  return readLiveDocument(LiveSuggestions.settledCopy(live, accept), comparison.format);
}

/** Both ways exact (review.md "Exact both ways"). */
function expectExact(primary: TextDocument, selected: TextDocument): TextDocument {
  const comparison = compared(primary, selected);
  expect(reading(settled(comparison, false))).toBe(reading(primary));
  expect(reading(settled(comparison, true))).toBe(reading(selected));
  return comparison;
}

const firstParagraph = (d: TextDocument): Paragraph => d.body[0] as Paragraph;
const ids = (d: TextDocument) => new Set(Suggestions.marks(d.body).map((m) => m.id));

describe('TextDocumentComparison.compare', () => {
  it('holds no suggestion for two documents that read the same', () => {
    const comparison = compared(doc(para('Same words.')), doc(para('Same words.')));
    expect(ids(comparison).size).toBe(0);
    expect(reading(comparison)).toBe('Same words.');
  });

  it('reads a word changed as one replacement', () => {
    const comparison = expectExact(doc(para('The quick fox.')), doc(para('The slow fox.')));
    const inlines = firstParagraph(comparison).inlines as Run[];
    const deleted = inlines.find((i) => i.suggested?.deletion);
    const inserted = inlines.find((i) => i.suggested?.insertion);
    expect(deleted?.text).toBe('quick');
    expect(inserted?.text).toBe('slow');
    expect(deleted?.suggested?.deletion?.id).toBe(inserted?.suggested?.insertion?.id);
    expect(inserted?.suggested?.insertion?.author).toEqual({ name: NAME, comparison: true });
    expect(inserted?.suggested?.insertion?.at).toBe(AT);
  });

  it('gives each stretch of differences its own suggestion', () => {
    const comparison = expectExact(
      doc(para('one two three four five')),
      doc(para('one 2 three four 5')),
    );
    expect(ids(comparison).size).toBe(2);
  });

  it('suggests formatting, keeping the primary’s as before', () => {
    const comparison = expectExact(
      doc(para([run('plain '), run('bold')])),
      doc(para([run('plain '), run('bold', { bold: true })])),
    );
    const bold = firstParagraph(comparison).inlines.find(
      (i): i is Run => i.type === 'run' && i.text === 'bold',
    )!;
    expect(bold.props).toEqual({ bold: true });
    expect(bold.suggested?.format?.before).toEqual({ props: {} });
    const boldOf = (d: TextDocument) =>
      firstParagraph(d).inlines.some((i) => i.type === 'run' && i.props.bold === true);
    expect(boldOf(settled(comparison, true))).toBe(true);
    expect(boldOf(settled(comparison, false))).toBe(false);
  });

  it('marks its suggestions as the comparison’s, live and in the model', () => {
    const comparison = compared(doc(para('a b')), doc(para('a c')));
    const live = new Y.Doc();
    writeLiveDocument(live, comparison);
    const [suggestion] = LiveSuggestions.read(live);
    expect(suggestion?.author).toEqual({
      name: NAME,
      colour: expect.any(String),
      fromComparison: true,
    });
    const back = readLiveDocument(live, comparison.format);
    const marks = Suggestions.marks(back.body);
    expect(marks[0]?.author).toEqual({ name: NAME, comparison: true });
  });

  it('refuses more differences than a document holds suggestions', () => {
    const paragraphs = (word: string) =>
      Array.from({ length: 5_001 }, (_, k) => para(`kept words ${k} ${word}`));
    const result = TextDocumentComparison.compare(
      doc(...paragraphs('old')),
      doc(...paragraphs('new')),
      {
        name: NAME,
        at: AT,
        comments: false,
      },
    );
    expect(result).toEqual({ ok: false, refusal: 'too-many' });
  });

  it('reads a link changed as a deletion and an insertion', () => {
    const comparison = expectExact(
      doc(para([run('see '), run('here', {}, 'https://a.example')])),
      doc(para([run('see '), run('here', {}, 'https://b.example')])),
    );
    const inlines = firstParagraph(comparison).inlines as Run[];
    expect(inlines.some((i) => i.suggested?.deletion && i.link === 'https://a.example')).toBe(true);
    expect(inlines.some((i) => i.suggested?.insertion && i.link === 'https://b.example')).toBe(
      true,
    );
  });

  it('suggests a paragraph’s style, keeping the primary’s as before', () => {
    const comparison = expectExact(doc(para('Title', normal)), doc(para('Title', 'Heading1')));
    const first = firstParagraph(comparison);
    expect(first.style).toBe('Heading1');
    expect(first.suggested?.format?.before.style).toBe(normal);
  });

  it('suggests a paragraph split as a break and a merge as a join', () => {
    const split = expectExact(doc(para('alpha beta')), doc(para('alpha'), para('beta')));
    expect((split.body[1] as Paragraph).suggested?.break).toBeDefined();
    const merged = expectExact(doc(para('alpha'), para('beta')), doc(para('alpha beta')));
    expect(merged.body.some((b) => b.type === 'paragraph' && b.suggested?.join)).toBe(true);
  });

  it('suggests paragraphs added and taken away', () => {
    expectExact(
      doc(para('first'), para('last')),
      doc(para('first'), para('new one'), para('another'), para('last')),
    );
    expectExact(doc(para('first'), para('gone'), para('last')), doc(para('first'), para('last')));
    expectExact(doc(para('kept')), doc(para('new start'), para('kept')));
    expectExact(doc(para('')), doc(para('written')));
  });

  it('pairs paragraphs that changed and compares their words', () => {
    const comparison = expectExact(
      doc(para('a long paragraph about rivers'), para('second paragraph about hills')),
      doc(para('a long paragraph about lakes'), para('second paragraph about hills and dales')),
    );
    const kept = comparison.body.filter(
      (b) => b.type === 'paragraph' && !b.suggested?.break && !b.suggested?.join,
    );
    expect(kept).toHaveLength(2);
  });

  it('reads objects in a line as words of their own', () => {
    const bookmark = (name: string): Inline => ({ type: 'bookmark', name, props: {} }) as Inline;
    const comparison = expectExact(
      doc(para([run('at '), bookmark('a'), run(' here')])),
      doc(para([run('at '), bookmark('b'), run(' here')])),
    );
    const inlines = firstParagraph(comparison).inlines;
    expect(inlines.filter((i) => i.type === 'bookmark')).toHaveLength(2);
  });

  it('compares the cells of two tables with as many columns', () => {
    const comparison = expectExact(
      doc(para('before'), table(row('a', 'b'), row('c', 'd')), para('after')),
      doc(para('before'), table(row('a', 'B'), row('c', 'd')), para('after')),
    );
    const t = comparison.body[1] as Table;
    expect(t.suggested).toBeUndefined();
    expect(t.rows.every((r) => !r.suggested)).toBe(true);
  });

  it('suggests a table’s rows added and taken away', () => {
    const added = expectExact(
      doc(para('x'), table(row('a', 'b'), row('c', 'd')), para('')),
      doc(para('x'), table(row('a', 'b'), row('new', 'row'), row('c', 'd')), para('')),
    );
    expect((added.body[1] as Table).rows[1]!.suggested?.insertion).toBeDefined();
    const taken = expectExact(
      doc(para('x'), table(row('a', 'b'), row('c', 'd'), row('e', 'f')), para('')),
      doc(para('x'), table(row('a', 'b'), row('e', 'f')), para('')),
    );
    expect((taken.body[1] as Table).rows[1]!.suggested?.deletion).toBeDefined();
  });

  it('deletes and inserts a table whose columns differ', () => {
    const comparison = expectExact(
      doc(para('x'), table(row('a', 'b')), para('')),
      doc(para('x'), table(row('a', 'b', 'c')), para('')),
    );
    const tables = comparison.body.filter((b): b is Table => b.type === 'table');
    expect(tables.map((t) => Object.keys(t.suggested ?? {}))).toEqual([
      ['deletion'],
      ['insertion'],
    ]);
  });

  it('suggests a table added and taken away whole', () => {
    expectExact(doc(para('x'), para('y')), doc(para('x'), table(row('t')), para('y')));
    expectExact(doc(para('x'), table(row('t')), para('y')), doc(para('x'), para('y')));
  });

  it('pairs document tabs in order and adds or empties the rest', () => {
    const comparison = compared(
      tabbed([para('one')], [para('two')]),
      tabbed([para('one!')], [para('two')], [para('three')]),
    );
    const tabs = DocumentTabs.all(comparison);
    expect(tabs).toHaveLength(3);
    expect(new Set(tabs.map((t) => t.id)).size).toBe(3);
    expect(reading(settled(comparison, true))).toBe('one! ⇥ two ⇥ three');
    expect(reading(settled(comparison, false))).toBe('one ⇥ two ⇥ ');

    const fewer = compared(tabbed([para('one')], [para('two')]), tabbed([para('one')]));
    expect(reading(settled(fewer, false))).toBe('one ⇥ two');
    expect(reading(settled(fewer, true))).toBe('one ⇥ ');
  });

  it('carries the selected’s comments only when asked, never the primary’s', () => {
    const thread = (id: string): FileThread => ({
      id,
      resolved: false,
      comments: [{ id: `${id}-c`, text: 'Note', author: { name: 'Ada', key: 'k-ada' } }],
    });
    const edge = (id: string, side: 'start' | 'end'): Inline => ({
      type: 'comment',
      edge: side,
      id,
      props: {},
    });
    const primary: TextDocument = {
      ...doc(para([edge('p', 'start'), run('text'), edge('p', 'end')])),
      comments: [thread('p')],
    };
    const selected: TextDocument = {
      ...doc(para([run('the '), edge('s', 'start'), run('text'), edge('s', 'end')])),
      comments: [thread('s')],
    };
    const without = compared(primary, selected);
    expect(without.comments ?? []).toEqual([]);
    expect(firstParagraph(without).inlines.some((i) => i.type === 'comment')).toBe(false);
    const withComments = compared(primary, selected, true);
    expect(withComments.comments?.map((t) => t.id)).toEqual(['s']);
    expect(withComments.comments?.[0]?.comments[0]?.author).toEqual({ name: 'Ada' });
    expect(
      firstParagraph(withComments)
        .inlines.filter((i) => i.type === 'comment')
        .map((i) => (i as { id: string }).id),
    ).toEqual(['s', 's']);
  });

  it('adds the selected’s styles and lists the comparison uses', () => {
    const selected: TextDocument = {
      ...doc(para('styled', 'Fancy')),
      styles: [...blank.styles, { ...blank.styles[0]!, id: 'Fancy', name: 'Fancy' }],
    };
    const comparison = compared(doc(para('styled')), selected);
    expect(comparison.styles.some((s) => s.id === 'Fancy')).toBe(true);
  });

  it('refuses a side past the most words', () => {
    const long = 'w '.repeat(TEXT_DOCUMENT_COMPARE_TOKENS_MAX / 2 + 1);
    const result: ComparisonResult = TextDocumentComparison.compare(
      doc(para(long)),
      doc(para('x')),
      {
        name: NAME,
        at: AT,
        comments: false,
      },
    );
    expect(result).toEqual({ ok: false, refusal: 'too-long' });
  });

  it('keeps the reading exact over a varied pair', () => {
    expectExact(
      doc(
        para('Intro line stays.'),
        para('This paragraph will lose a word or two today.'),
        table(row('h1', 'h2'), row('x', 'y')),
        para('Middle text.'),
        para('Gone entirely.'),
        para('Closing words here.'),
      ),
      doc(
        para('Intro line stays.'),
        para('This paragraph will gain words today, surely.'),
        para('A new one.'),
        table(row('h1', 'h2'), row('x', 'z'), row('p', 'q')),
        para('Middle text.'),
        para('Closing words', 'Heading1'),
        para('here.'),
      ),
    );
  });

  it('compares two long documents within its budget', () => {
    const words = (n: number, change: boolean) =>
      Array.from({ length: n }, (_, k) =>
        change && k % 20 === 0 ? `changed${k}` : `word${k}`,
      ).join(' ');
    const pages = (change: boolean) =>
      Array.from({ length: 1_500 }, (_, p) => para(`${p} ${words(45, change)}`));
    const started = performance.now();
    const result = TextDocumentComparison.compare(doc(...pages(false)), doc(...pages(true)), {
      name: NAME,
      at: AT,
      comments: false,
    });
    expect(performance.now() - started).toBeLessThan(TEXT_DOCUMENT_COMPARE_BUDGET_MS);
    expect(result.ok).toBe(true);
  });

  it('compares two long documents that share nothing within its budget', () => {
    const pages = (side: string) =>
      Array.from({ length: 1_500 }, (_, p) =>
        para(Array.from({ length: 45 }, (_, k) => `${side}${p}x${k}`).join(' ')),
      );
    const started = performance.now();
    const result = TextDocumentComparison.compare(doc(...pages('a')), doc(...pages('b')), {
      name: NAME,
      at: AT,
      comments: false,
    });
    expect(performance.now() - started).toBeLessThan(TEXT_DOCUMENT_COMPARE_BUDGET_MS);
    expect(result.ok).toBe(true);
  });
});
