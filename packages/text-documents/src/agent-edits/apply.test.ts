import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { writeMarkdown } from '../exports/markdown';
import { readMarkdownImport } from '../imports/markdown';
import { LiveSuggestions } from '../live/live-suggestions';
import { LiveThreads } from '../live/live-threads';
import { Blocks } from '../model/tables';
import { ReportBuilder } from '../report';
import { TextDocument } from '../model/text-document';
import { TextDocumentState } from '../text-document-state';
import { applyTextChangeset, type TextChangesetInput } from './apply';
import { parseTextOps } from './parse';
import { revertTextChangeset } from './revert';
import { UndoSteps } from '../versions/undo-step';

const AUTHOR = { key: 'owner-1', name: 'Webber', colour: '#3366cc' };

const stateOf = (markdown: string): Uint8Array[] => [
  TextDocumentState.fromDocument(readMarkdownImport(markdown, new ReportBuilder())),
];

const BASE = stateOf(
  [
    '# Plan',
    '',
    'Hello world, this is the intro.',
    '',
    'A second paragraph with a word.',
    '',
    '| Name | Role |',
    '| --- | --- |',
    '| Ada | Lead |',
    '| Bo | Dev |',
  ].join('\n'),
);

function apply(state: Uint8Array[], text: string, extra: Partial<TextChangesetInput> = {}) {
  const parsed = parseTextOps(text);
  if (!parsed.ok) throw new Error(parsed.message);
  let next = 0;
  return applyTextChangeset({
    state,
    format: 'odf',
    ops: parsed.ops,
    author: AUTHOR,
    now: 1_000,
    newId: () => `id${(next += 1)}`,
    ...extra,
  });
}

function applied(state: Uint8Array[], text: string, extra: Partial<TextChangesetInput> = {}) {
  const result = apply(state, text, extra);
  if (!result.ok) throw new Error(`${result.error}: ${result.message}`);
  return result;
}

const documentOf = (updates: Uint8Array[]) =>
  TextDocumentState.document(TextDocumentState.load(updates), 'odf');
const markdownOf = (updates: Uint8Array[]) => writeMarkdown(documentOf(updates)).trim();
const after = (state: Uint8Array[], text: string) => {
  const result = applied(state, text);
  return { result, updates: [...state, result.update!] };
};

describe('applyTextChangeset', () => {
  it('edits text in place, keeping its run’s formatting, with the new text’s marks', () => {
    const { result, updates } = after(BASE, 'edit "Hello world" "Hi **all**"');
    expect(result.results).toEqual(['edited ¶2']);
    expect(markdownOf(updates)).toContain('Hi **all**, this is the intro.');
  });

  it('inserts, appends and prepends Markdown, answering the paragraphs they became', () => {
    const { result, updates } = after(
      BASE,
      [
        'insert after ¶2 "## Next\\n\\nMore here."',
        'insert before "second paragraph" "- one\\n- two"',
        'append "Tail."',
        'prepend "Head."',
      ].join('\n'),
    );
    expect(result.results).toEqual([
      'inserted ¶3..¶4',
      'inserted ¶5..¶6',
      'appended ¶14',
      'prepended ¶1',
    ]);
    const markdown = markdownOf(updates);
    expect(markdown.indexOf('Head.')).toBe(0);
    expect(markdown).toMatch(/## Next\n\nMore here\.\n\n- one\n- two\n\nA second/);
    expect(markdown.trim().endsWith('Tail.')).toBe(true);
  });

  it('gives inserted headings the document’s own heading style and lists a new list', () => {
    const { updates } = after(BASE, 'append "### Deep\\n\\n1. first\\n2. second"');
    const doc = documentOf(updates);
    const paragraphs = Blocks.paragraphs(doc.body);
    const deep = paragraphs.find((p) =>
      p.inlines.some((i) => i.type === 'run' && i.text === 'Deep'),
    )!;
    expect(doc.styles.find((s) => s.id === deep.style)?.role).toBe('heading3');
    const first = paragraphs.find((p) =>
      p.inlines.some((i) => i.type === 'run' && i.text === 'first'),
    )!;
    expect(first.list?.id).toBe('id1');
    expect(Object.keys(doc.lists)).toContain('id1');
  });

  it('adds a code block’s style the document lacks, and a table as wide as the text', () => {
    const { updates } = after(
      BASE,
      'append "```ts\\nconst a = 1;\\n```\\n\\n| a | b |\\n| - | - |\\n| 1 | 2 |"',
    );
    const doc = documentOf(updates);
    expect(doc.styles.some((s) => s.name === 'Code (TypeScript)')).toBe(true);
    const tables = doc.body.filter((b) => b.type === 'table');
    const width = (t: (typeof tables)[number]) =>
      t.type === 'table' ? t.columns.reduce((a, b) => a + b, 0) : 0;
    expect(width(tables[1]!)).toBeCloseTo(width(tables[0]!), 3);
  });

  it('edits text in a later formatted run, keeping that run’s formatting', () => {
    const { updates } = after(BASE, 'format "intro" bold\nedit "intro" "opening ~~old~~ _new_"');
    expect(markdownOf(updates)).toContain('**opening** **~~old~~** ***new***');
  });

  it('reuses a code style the document has, and adopts an OOXML document’s own styles', () => {
    const twice = after(after(BASE, 'append "```\\nx\\n```"').updates, 'append "```\\ny\\n```"');
    expect(documentOf(twice.updates).styles.filter((st) => st.name === 'Code')).toHaveLength(1);
    const ooxml = [TextDocumentState.fromDocument(TextDocument.blank({ format: 'ooxml' }))];
    const result = applied(ooxml, 'append "## Two\\n\\n```py\\nx\\n```"', { format: 'ooxml' });
    const doc = TextDocumentState.document(
      TextDocumentState.load([...ooxml, result.update!]),
      'ooxml',
    );
    const styles = Blocks.paragraphs(doc.body).map((p) => p.style);
    expect(styles).toEqual(['Normal', 'Heading2', 'CodePython']);
  });

  it('styles a paragraph by name, by name in any case, and by role', () => {
    const { result } = after(
      BASE,
      'style ¶2 "Heading 2"\nstyle ¶3 "heading 3"\nstyle "Ada" "title"',
    );
    expect(result.results).toEqual([
      'styled ¶2 "Heading 2"',
      'styled ¶3 "Heading 3"',
      'styled ¶6 "Title"',
    ]);
  });

  it('formats text, putting marks on and taking them off', () => {
    const { result, updates } = after(
      BASE,
      'format "intro" bold link=https://example.com\nformat "intro" -bold',
    );
    expect(result.results).toEqual([
      'formatted ¶2 bold link=https://example.com',
      'formatted ¶2 -bold',
    ]);
    expect(markdownOf(updates)).toContain('[intro](<https://example.com>)');
  });

  it('refuses a link that is not a safe address', () => {
    expect(apply(BASE, 'format "intro" link=javascript:alert(1)')).toMatchObject({
      ok: false,
      error: 'invalid_operation',
      message: 'link=<url>: an http, https or mailto address',
    });
  });

  it('comments on the occurrence, by the token’s owner', () => {
    const { result, updates } = after(BASE, 'comment "a word" "Which word?"');
    expect(result.results).toEqual(['commented ¶3 id1']);
    expect(result.threads).toEqual(['id1']);
    const [thread] = LiveThreads.read(TextDocumentState.load(updates));
    expect(thread).toMatchObject({ id: 'id1', tab: 't.0', quote: 'a word', resolved: false });
    expect(thread!.comments[0]).toMatchObject({
      id: 'id2',
      text: 'Which word?',
      at: 1_000,
      author: AUTHOR,
    });
  });

  it('refuses a comment past its length', () => {
    expect(apply(BASE, `comment "word" "${'x'.repeat(2001)}"`)).toMatchObject({
      error: 'invalid_operation',
    });
  });

  it('makes suggestions the editor reads as the owner’s', () => {
    const { result, updates } = after(
      BASE,
      [
        'suggest edit "Hello" "Hi"',
        'suggest append "New."',
        'suggest format "intro" italic',
        'suggest insert after ¶1 "| x |\\n| - |\\n| y |"',
      ].join('\n'),
    );
    expect(result.results).toEqual([
      'suggested ¶2 id1',
      'suggested ¶10 id2',
      'suggested ¶2 id3',
      'suggested ¶2..¶3 id4',
    ]);
    const suggestions = LiveSuggestions.read(TextDocumentState.load(updates));
    expect(new Set(suggestions.map((s) => s.id))).toEqual(new Set(['id1', 'id2', 'id3', 'id4']));
    expect(suggestions.every((s) => s.author.key === AUTHOR.key)).toBe(true);
  });

  it('keeps a stretch’s first formatting under a second format suggestion', () => {
    const once = after(BASE, 'suggest format "intro" bold');
    const twice = after(once.updates, 'suggest format "the intro" italic');
    expect(twice.result.results).toEqual(['suggested ¶2 id1']);
    expect(LiveSuggestions.read(TextDocumentState.load(twice.updates)).length).toBeGreaterThan(0);
  });

  it.each([
    [
      'edit "nowhere" "x"',
      'text_not_found',
      '"nowhere" is not in the document tab as written (case and all, within one paragraph)',
    ],
    ['edit "a" "x"', 'text_ambiguous', undefined],
    ['insert after ¶99 "x"', 'ref_not_found', '¶99 is past the document tab: it holds ¶1..¶9'],
    ['style ¶2 "Fancy"', 'ref_not_found', undefined],
    ['table ¶2 add-row 1', 'ref_not_found', '¶2 is not in a table'],
    ['table "Ada" add-row 9', 'ref_not_found', 'after row 9: the table has 3 rows and 2 columns'],
    ['table "Ada" delete-row 4', 'ref_not_found', 'row 4: the table has 3 rows and 2 columns'],
    [
      'table "Ada" add-column 3',
      'ref_not_found',
      'after column 3: the table has 3 rows and 2 columns',
    ],
    [
      'table "Ada" delete-column 3',
      'ref_not_found',
      'column 3: the table has 3 rows and 2 columns',
    ],
    ['table "Ada" set 4,1 "x"', 'ref_not_found', 'cell 4,1: the table has 3 rows and 2 columns'],
  ])('refuses %s as %s', (text, error, message) => {
    const result = apply(BASE, text);
    expect(result).toMatchObject({ ok: false, error, line: 1, operation: 1 });
    if (message && !result.ok) expect(result.message).toBe(message);
  });

  it('names each paragraph an ambiguous text occurs in', () => {
    expect(apply(BASE, 'comment "is" "x"')).toMatchObject({
      error: 'text_ambiguous',
      paragraphs: [2],
      message: '"is" occurs 2 times: in ¶2; quote more of it',
    });
  });

  it('writes nothing when a later operation is refused', () => {
    expect(apply(BASE, 'edit "Hello" "Hi"\nappend "x"\nedit "nowhere" "y"')).toMatchObject({
      ok: false,
      error: 'text_not_found',
      line: 3,
      operation: 3,
    });
  });

  it('matches text as the operations before left it', () => {
    const { result } = after(BASE, 'edit "Hello" "Howdy"\nformat "Howdy" bold');
    expect(result.results).toEqual(['edited ¶2', 'formatted ¶2 bold']);
  });

  it('finds the document tab by id or name, and refuses one the document lacks', () => {
    expect(apply(BASE, 'append "x"', { documentTab: 't.9' })).toMatchObject({
      error: 'ref_not_found',
      message: 'no document tab "t.9": the document has "Tab 1"',
    });
    expect(applied(BASE, 'append "x"', { documentTab: 'tab 1' }).documentTab).toBe('t.0');
    expect(applied(BASE, 'append "x"', { documentTab: 't.0' }).documentTab).toBe('t.0');
    expect(applied(BASE, 'append "x"').documentTab).toBe('t.0');
  });

  it('replaces the tab only from the state read', () => {
    const base = Y.encodeStateVector(TextDocumentState.load(BASE));
    expect(apply(BASE, 'replace "# New"')).toMatchObject({ error: 'stale_tab', line: 1 });
    const moved = after(BASE, 'append "x"').updates;
    expect(apply(moved, 'replace "# New"', { base })).toMatchObject({ error: 'stale_tab' });
  });

  it('answers no update for operations that change nothing', () => {
    const result = applied(BASE, 'format "intro" -bold');
    expect(result.results).toEqual(['formatted ¶2 -bold']);
  });
});

describe('replace', () => {
  it('writes the whole tab from Markdown', () => {
    const base = Y.encodeStateVector(TextDocumentState.load(BASE));
    const result = applied(BASE, 'replace "# New\\n\\nBody."', { base });
    expect(result.results).toEqual(['replaced ¶1..¶2']);
    expect(markdownOf([...BASE, result.update!])).toBe('# New\n\nBody.');
    const empty = applied(BASE, 'replace ""', { base });
    expect(empty.results).toEqual(['replaced ¶1']);
  });
});

describe('table operations', () => {
  const table = (updates: Uint8Array[]) => {
    const block = documentOf(updates).body.find((b) => b.type === 'table');
    if (block?.type !== 'table') return null;
    return {
      columns: block.columns.map((c) => Math.round(c)),
      rows: block.rows.map((row) =>
        row.cells.map((cell) =>
          Blocks.paragraphs(cell.blocks)
            .map((p) => p.inlines.map((i) => (i.type === 'run' ? i.text : '')).join(''))
            .join('/'),
        ),
      ),
      headerRows: block.headerRows,
    };
  };

  it('adds and deletes rows and columns, and sets a cell', () => {
    const before = table(BASE)!;
    const { result, updates } = after(
      BASE,
      [
        'table "Ada" add-row 3',
        'table "Ada" set 4,1 "Cy **x**"',
        'table "Ada" add-column 1',
        'table "Ada" set 1,2 "Mid"',
        'table "Ada" delete-row 2',
        'table "Name" delete-column 3',
        'table "Name" add-row 0',
      ].join('\n'),
    );
    expect(result.results).toEqual([
      'table ¶6 add-row 3',
      'table ¶6 set 4,1',
      'table ¶6 add-column 1',
      'table ¶7 set 1,2',
      'table ¶7 delete-row 2',
      'table ¶4 delete-column 3',
      'table ¶4 add-row 0',
    ]);
    const now = table(updates)!;
    expect(now.rows).toEqual([
      ['', ''],
      ['Name', 'Mid'],
      ['Bo', ''],
      ['Cy x', ''],
    ]);
    expect(now.columns.reduce((a, b) => a + b, 0)).toBeLessThan(
      before.columns.reduce((a, b) => a + b, 0),
    );
  });

  it('keeps the table’s width when a column is added', () => {
    const before = table(BASE)!;
    const now = table(after(BASE, 'table "Ada" add-column 2').updates)!;
    expect(now.columns).toHaveLength(3);
    expect(now.columns.reduce((a, b) => a + b, 0)).toBeCloseTo(
      before.columns.reduce((a, b) => a + b, 0),
      -1,
    );
  });

  it('deletes the table with its last row or column, leaving a paragraph where it was alone', () => {
    const one = stateOf('| a |\n| - |');
    const rows = after(one, 'table "a" delete-row 1');
    expect(table(rows.updates)).toBeNull();
    expect(Blocks.paragraphs(documentOf(rows.updates).body)).toHaveLength(1);
    expect(table(after(one, 'table "a" delete-column 1').updates)).toBeNull();
    const kept = after(stateOf('Before.\n\n| a |\n| - |'), 'table "a" delete-row 1');
    expect(markdownOf(kept.updates)).toBe('Before.');
  });
});

describe('merged cells', () => {
  // A 3×3 table with a cell merged across the first two columns of row 1 and down the first two rows of column 3.
  const merged = (headerRows = 0) => {
    const doc = TextDocumentState.load(BASE);
    const document = TextDocumentState.document(doc, 'odf');
    const cell = (text: string, extra = {}) => ({
      blocks: [
        {
          type: 'paragraph' as const,
          style: 'Standard',
          props: {},
          inlines: [{ type: 'run' as const, text, props: {} }],
        },
      ],
      props: {},
      ...extra,
    });
    const tableBlock = {
      type: 'table' as const,
      columns: [100, 100, 100],
      headerRows,
      rows: [
        { cells: [cell('ab', { colSpan: 2 }), cell('c', { rowSpan: 2 })] },
        { cells: [cell('d'), cell('e')] },
        { cells: [cell('g'), cell('h'), cell('i')] },
      ],
    };
    return [TextDocumentState.fromDocument({ ...document, body: [tableBlock] })];
  };
  const grid = (updates: Uint8Array[]) => {
    const block = documentOf(updates).body.find((b) => b.type === 'table');
    if (block?.type !== 'table') throw new Error('no table');
    return block.rows.map((row) =>
      row.cells.map((cell) => {
        const text = Blocks.paragraphs(cell.blocks)
          .map((p) => p.inlines.map((i) => (i.type === 'run' ? i.text : '')).join(''))
          .join('');
        return `${text}${cell.colSpan ? `>${cell.colSpan}` : ''}${cell.rowSpan ? `v${cell.rowSpan}` : ''}`;
      }),
    );
  };

  it('adds a header row between header rows', () => {
    const state = merged(2);
    const block = documentOf(after(state, 'table "ab" add-row 1').updates).body.find(
      (x) => x.type === 'table',
    );
    expect(block?.type === 'table' && block.headerRows).toBe(3);
  });

  it('grows a merged cell across an added row or column', () => {
    expect(grid(after(merged(), 'table "ab" add-row 1').updates)).toEqual([
      ['ab>2', 'cv3'],
      ['', ''],
      ['d', 'e'],
      ['g', 'h', 'i'],
    ]);
    expect(grid(after(merged(), 'table "ab" add-column 1').updates)).toEqual([
      ['ab>3', 'cv2'],
      ['d', '', 'e'],
      ['g', '', 'h', 'i'],
    ]);
  });

  it('shrinks a merged cell across a deleted row or column, carrying one that started there on', () => {
    expect(grid(after(merged(), 'table "g" delete-row 2').updates)).toEqual([
      ['ab>2', 'c'],
      ['g', 'h', 'i'],
    ]);
    expect(grid(after(merged(), 'table "g" delete-row 1').updates)).toEqual([
      ['d', 'e', ''],
      ['g', 'h', 'i'],
    ]);
    expect(grid(after(merged(), 'table "g" delete-column 1').updates)).toEqual([
      ['ab', 'cv2'],
      ['e'],
      ['h', 'i'],
    ]);
    expect(grid(after(merged(), 'table "g" set 2,3 "C"').updates)).toEqual([
      ['ab>2', 'Cv2'],
      ['d', 'e'],
      ['g', 'h', 'i'],
    ]);
  });
});

describe('revertTextChangeset', () => {
  it('undoes exactly the changeset, keeping what was written since, and resolves its threads', () => {
    const result = applied(BASE, 'edit "Hello" "Hi"\nappend "Added."\ncomment "intro" "Hm"');
    const afterChange = [...BASE, result.update!];
    // A person types after the agent.
    const person = TextDocumentState.load(afterChange);
    const since = (() => {
      const updates: Uint8Array[] = [];
      person.on('update', (u: Uint8Array) => updates.push(u));
      const second = TextDocumentState.body(person).get(2) as Y.XmlElement;
      (second.get(0) as Y.XmlText).insert(0, 'Note: ');
      return Y.mergeUpdates(updates);
    })();
    const state = [...afterChange, since];
    const revert = revertTextChangeset(state, UndoSteps.encode(result.step), result.threads)!;
    const reverted = [...state, revert];
    const markdown = markdownOf(reverted);
    expect(markdown).toContain('Hello world, this is the intro.');
    expect(markdown).toContain('Note: A second paragraph');
    expect(markdown).not.toContain('Added.');
    expect(LiveThreads.read(TextDocumentState.load(reverted))[0]).toMatchObject({
      id: 'id1',
      resolved: true,
    });
  });

  it('writes nothing for a step that does not read, or an empty one', () => {
    expect(revertTextChangeset(BASE, new Uint8Array([1]), [])).toBeNull();
    const empty = UndoSteps.encode({
      insertions: Y.createDeleteSet(),
      deletions: Y.createDeleteSet(),
    });
    expect(revertTextChangeset(BASE, empty, [])).toBeNull();
  });

  it('merges with a peer’s concurrent update', () => {
    const result = applied(BASE, 'edit "intro" "opening"');
    const peer = TextDocumentState.load(BASE);
    const peerUpdates: Uint8Array[] = [];
    peer.on('update', (u: Uint8Array) => peerUpdates.push(u));
    ((TextDocumentState.body(peer).get(2) as Y.XmlElement).get(0) as Y.XmlText).insert(0, 'Peer ');
    const merged = markdownOf([...BASE, ...peerUpdates, result.update!]);
    expect(merged).toContain('this is the opening.');
    expect(merged).toContain('Peer A second');
  });
});
