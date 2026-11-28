// A two-tab text document for the text document views' goldens (docs/specs/034-text-documents/agents-and-sync.md
// "Reading"): a title, headings of two levels, a list with a checklist item, a table, a picture, an equation, a
// footnote, a comment thread with a reply, a suggestion, kept content and a second document tab.
import {
  ListDefinition,
  Styles,
  TextDocument,
  type Block,
  type Inline,
  type Paragraph,
} from '@livedoc/text-documents';

const styles = Styles.builtIn('ooxml');
const role = (r: Parameters<typeof Styles.idOfRole>[1]) => Styles.idOfRole(styles, r)!;
const run = (text: string, extra: Partial<Extract<Inline, { type: 'run' }>> = {}): Inline => ({
  type: 'run',
  text,
  props: {},
  ...extra,
});
const para = (
  r: Parameters<typeof Styles.idOfRole>[1],
  inlines: readonly Inline[],
  extra: Partial<Paragraph> = {},
): Paragraph => ({ type: 'paragraph', style: role(r), props: {}, inlines, ...extra });
const text = (
  r: Parameters<typeof Styles.idOfRole>[1],
  t: string,
  extra: Partial<Paragraph> = {},
) => para(r, t ? [run(t)] : [], extra);
const cell = (t: string) => ({ blocks: [text('normal', t)], props: {} });

const ADA = { id: 's1', at: 1, author: { name: 'Ada' } };

const body: Block[] = [
  text('title', 'Launch plan'),
  text('heading1', 'Intro'),
  para('normal', [
    { type: 'comment', edge: 'start', id: 'c1', props: {} },
    run('We ship in May.'),
    { type: 'comment', edge: 'end', id: 'c1', props: {} },
    run(' Truly', { suggested: { insertion: ADA } }),
    {
      type: 'note',
      blocks: [text('normal', 'Barring weather.')],
      props: {},
    },
  ]),
  text('heading2', 'Scope'),
  text('normal', 'Write the docs', { list: { id: 'l1', level: 0 } }),
  text('normal', 'Test it', { list: { id: 'l2', level: 0, checked: true } }),
  {
    type: 'table',
    columns: [100, 100],
    headerRows: 1,
    rows: [{ cells: [cell('Who'), cell('What')] }, { cells: [cell('Ada'), cell('Docs | site')] }],
  },
  para('normal', [
    {
      type: 'picture',
      media: 'm1',
      width: 10,
      height: 10,
      alt: 'The launch timeline',
      props: {},
    },
  ]),
  para('normal', [
    {
      type: 'equation',
      math: [
        { kind: 'identifier', text: 'x' },
        { kind: 'operator', text: '=' },
        { kind: 'number', text: '2' },
      ],
      props: {},
    },
  ]),
  text('normal', ''),
  {
    type: 'kept',
    name: 'altChunk',
    xml: { name: 'w:altChunk', attributes: {}, children: [] } as never,
  },
  text('heading1', 'Actions'),
  text('normal', 'Book the room.'),
  text('heading1', ''),
];

export function planDocument(): TextDocument {
  return {
    ...TextDocument.blank({ format: 'ooxml', title: 'Launch plan' }),
    styles,
    lists: { l1: ListDefinition.of('bullet'), l2: ListDefinition.of('check') },
    body,
    tabs: {
      first: { id: 't.0', name: 'Plan' },
      more: [{ id: 't.1', name: 'Notes', depth: 0, body: [text('normal', 'Loose ends.')] }],
    },
    comments: [
      {
        id: 'c1',
        resolved: false,
        quote: 'We ship in May.',
        comments: [
          { id: 'c1a', text: 'Sure?', author: { name: 'Bo' } },
          { id: 'c1b', text: 'Yes.', author: { name: 'Ada' } },
        ],
      },
    ],
  };
}

const NOBODY = { id: 's2', at: 1, author: { name: '' } };

/**
 * The odds and ends of a document tab the views name: a drawing and a decorative picture, a bookmark, a style the
 * document lacks, an unticked checklist item, a section break, a table of contents, a one-column table, a long
 * suggestion in two runs by no one named, a paragraph break suggested, a resolved thread with no quote, and a thread
 * marked in the writing that the document no longer holds.
 */
export function oddsDocument(): TextDocument {
  const blank = TextDocument.blank({ format: 'odf' });
  const long = 'x'.repeat(60);
  return {
    ...blank,
    lists: { l3: ListDefinition.of('check') },
    body: [
      para('normal', [
        { type: 'picture', media: 'm1', width: 1, height: 1, drawing: 'd1', props: {} },
        { type: 'picture', media: 'm2', width: 1, height: 1, decorative: true, props: {} },
        { type: 'bookmark', name: 'here', props: {} },
      ]),
      { type: 'paragraph', style: 'Missing', props: {}, inlines: [run('Odd style')] },
      text('normal', 'Not yet', { list: { id: 'l3', level: 1, checked: false } }),
      { type: 'section', ...blank.section },
      { type: 'contents', look: 'plain', levels: 3, entries: [text('normal', 'Intro\t1')] },
      { type: 'table', columns: [100], headerRows: 0, rows: [{ cells: [cell('Solo')] }] },
      para(
        'normal',
        [
          run(long, { suggested: { deletion: NOBODY } }),
          run(long, { suggested: { deletion: NOBODY } }),
        ],
        {
          suggested: { break: { id: 's3', at: 1, author: { name: 'Bo' } } },
        },
      ),
      para('normal', [
        { type: 'comment', edge: 'start', id: 'c2', props: {} },
        run('Settled  words'),
        { type: 'comment', edge: 'end', id: 'c2', props: {} },
        { type: 'comment', edge: 'start', id: 'gone', props: {} },
        run('!'),
        { type: 'comment', edge: 'end', id: 'gone', props: {} },
      ]),
    ],
    comments: [
      {
        id: 'c2',
        resolved: true,
        comments: [{ id: 'c2a', text: 'Done', author: { name: 'Bo' } }],
      },
    ],
  };
}
