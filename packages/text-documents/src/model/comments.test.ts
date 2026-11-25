// docs/specs/034-text-documents/review.md "How a comment is kept": a thread's markers in the writing, a point comment,
// a marker without its pair, a comment in a story.
import { describe, expect, it } from 'vitest';
import { Paragraph, type Block, type Inline } from './blocks';
import { Comments, type CommentMark, type FileThread } from './comments';
import { TextDocument } from './text-document';
import { ReportBuilder } from '../report';

const run = (text: string): Inline => ({ type: 'run', text, props: {} });
const mark = (edge: CommentMark['edge'], id: string): CommentMark => ({
  type: 'comment',
  edge,
  id,
  props: {},
});
const para = (...inlines: Inline[]): Block => ({ ...Paragraph.of('', 'Standard'), inlines });
const thread = (id: string, text = 'Looks good.'): FileThread => ({
  id,
  resolved: false,
  comments: [{ id: `${id}.0`, text, author: { name: 'Ada' } }],
});
const doc = (body: Block[], comments: FileThread[]): TextDocument => ({
  ...TextDocument.blank(),
  body,
  comments,
});
const marks = (blocks: readonly Block[]): string[] =>
  blocks.flatMap((b) =>
    b.type === 'paragraph'
      ? b.inlines.flatMap((i) => (i.type === 'comment' ? [`${i.edge}:${i.id}`] : []))
      : b.type === 'table'
        ? b.rows.flatMap((r) => r.cells.flatMap((c) => marks(c.blocks)))
        : [],
  );

describe('Comments.settle', () => {
  it('keeps a paired thread as it is', () => {
    const body = [para(run('a'), mark('start', 'c'), run('b'), mark('end', 'c'))];
    const report = new ReportBuilder();
    const settled = Comments.settle(doc(body, [thread('c')]), report);
    expect(marks(settled.body)).toEqual(['start:c', 'end:c']);
    expect(settled.comments).toHaveLength(1);
    expect(report.build().dropped).toEqual([]);
  });

  it('makes a start without an end a point: its end right after it', () => {
    const body = [para(run('a'), mark('start', 'c'), run('b'))];
    const settled = Comments.settle(doc(body, [thread('c')]), new ReportBuilder());
    expect((settled.body[0] as Paragraph).inlines.map((i) => i.type)).toEqual([
      'run',
      'comment',
      'comment',
      'run',
    ]);
    expect(marks(settled.body)).toEqual(['start:c', 'end:c']);
  });

  it('pairs markers across paragraphs and into table cells', () => {
    const cell: Block = {
      type: 'table',
      columns: [10],
      headerRows: 0,
      rows: [{ cells: [{ props: {}, blocks: [para(run('x'), mark('end', 'c'))] }] }],
    };
    const body = [para(mark('start', 'c'), run('a')), cell];
    const settled = Comments.settle(doc(body, [thread('c')]), new ReportBuilder());
    expect(marks(settled.body)).toEqual(['start:c', 'end:c']);
  });

  it('drops an end without a start, a marker whose thread is absent, and a thread with no marker', () => {
    const body = [
      para(mark('end', 'a'), run('x'), mark('start', 'gone'), mark('end', 'gone')),
      para(mark('start', 'b'), mark('end', 'b'), mark('end', 'b')),
    ];
    const report = new ReportBuilder();
    const settled = Comments.settle(doc(body, [thread('a'), thread('b'), thread('lost')]), report);
    expect(marks(settled.body)).toEqual(['start:b', 'end:b']);
    expect(settled.comments?.map((t) => t.id)).toEqual(['b']);
    expect(report.build().dropped).toEqual([
      { reason: 'comment-unpaired', name: 'comment marker', count: 4 },
      { reason: 'comment-unpaired', name: 'comment', count: 2 },
    ]);
  });

  it('ends a thread whose end is in another document tab at its start', () => {
    const tabbed: TextDocument = {
      ...doc([para(mark('start', 'c'), run('a'))], [thread('c')]),
      tabs: {
        first: { id: 't.0', name: 'Tab 1' },
        more: [{ id: 't.1', name: 'Two', depth: 0, body: [para(run('b'), mark('end', 'c'))] }],
      },
    };
    const settled = Comments.settle(tabbed, new ReportBuilder());
    expect(marks(settled.body)).toEqual(['start:c', 'end:c']);
    expect(marks(settled.tabs!.more[0]!.body)).toEqual([]);
  });

  it('drops markers in a note, reported as in a story', () => {
    const body = [
      para(run('a'), {
        type: 'note',
        props: {},
        blocks: [para(mark('start', 'n'), run('x'), mark('end', 'n'))],
      }),
    ];
    const report = new ReportBuilder();
    const settled = Comments.settle(doc(body, [thread('n')]), report);
    expect(settled.comments).toBeUndefined();
    const note = (settled.body[0] as Paragraph).inlines[1];
    expect(note?.type === 'note' && marks(note.blocks)).toEqual([]);
    expect(report.build().dropped).toContainEqual({
      reason: 'comment-in-story',
      name: 'comment marker',
      count: 2,
    });
  });

  it('leaves a document with no comments untouched', () => {
    const document = doc([para(run('a'))], []);
    expect(Comments.settle({ ...document, comments: undefined }, new ReportBuilder())).toEqual({
      ...document,
      comments: undefined,
    });
  });
});

describe('Comments.quotes', () => {
  it('reads each thread’s stretch as text, paragraphs joined by line breaks, a point as empty', () => {
    const body = [
      para(run('a'), mark('start', 'c'), run('bc'), mark('start', 'p'), mark('end', 'p')),
      para(run('de'), mark('end', 'c'), run('f')),
    ];
    expect(Comments.quotes(body)).toEqual(
      new Map([
        ['c', 'bc\nde'],
        ['p', ''],
      ]),
    );
  });
});

describe('Comments.initials', () => {
  it.each<[string, string]>([
    ['Ada Lovelace', 'AL'],
    ['ada', 'A'],
    ['  ', ''],
    ['Jean-Luc de la Croix', 'JC'],
  ])('makes initials of %j', (name, initials) => {
    expect(Comments.initials(name)).toBe(initials);
  });
});

describe('Comments.lines', () => {
  it('splits a comment’s plain text into its paragraphs, one at least', () => {
    expect(Comments.lines('a\nb')).toEqual(['a', 'b']);
    expect(Comments.lines('')).toEqual(['']);
    expect(Comments.lines('a\r\nb')).toEqual(['a', 'b']);
  });
});

describe('Comments.timeOf', () => {
  it('reads a date with no zone as UTC, one with a zone as it says, and none as none', () => {
    expect(Comments.timeOf('2026-11-18T10:00:00')).toBe(Date.UTC(2026, 10, 18, 10));
    expect(Comments.timeOf('2026-11-18T10:00:00.5')).toBe(Date.UTC(2026, 10, 18, 10, 0, 0, 500));
    expect(Comments.timeOf('2026-11-18T10:00:00Z')).toBe(Date.UTC(2026, 10, 18, 10));
    expect(Comments.timeOf('2026-11-18T11:00:00+01:00')).toBe(Date.UTC(2026, 10, 18, 10));
    expect(Comments.timeOf('soon')).toBeUndefined();
    expect(Comments.timeOf(undefined)).toBeUndefined();
  });
});
