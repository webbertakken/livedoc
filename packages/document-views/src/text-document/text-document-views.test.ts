// docs/specs/034-text-documents/agents-and-sync.md "Reading": a text document's outline, text and structure views.
import { describe, expect, it } from 'vitest';
import { TextDocument } from '@livedoc/text-documents';
import { oddsDocument, planDocument } from '../__fixtures__/text-document/plan-document';
import { textDocumentOutlineView } from './outline';
import { documentTabOf, parseParagraphRange } from './reading';
import { textDocumentStructureView } from './structure';
import { textDocumentTextView } from './text';

const GOLDEN = '../__fixtures__/golden/text-document';
const doc = planDocument();
const plan = documentTabOf(doc, undefined)!;

describe('the outline', () => {
  it('lists each document tab and its headings with their paragraph numbers', async () => {
    const view = textDocumentOutlineView({ name: 'Launch plan', document: doc, current: 't.0' });
    await expect(view.text).toMatchFileSnapshot(`${GOLDEN}/outline.txt`);
    expect(view.json.tabs.map((t) => [t.name, t.paragraphs, t.current])).toEqual([
      ['Plan', 16, true],
      ['Notes', 1, false],
    ]);
    // Intro holds what comes before Actions: everything under its H2 too.
    expect(view.json.tabs[0]!.headings.map((h) => [h.number, h.level, h.paragraphs])).toEqual([
      [2, 1, 11],
      [4, 2, 9],
      [14, 1, 1],
      [16, 1, 0],
    ]);
  });

  it('says a tab with no headings, and one with nothing in it', () => {
    const blank = TextDocument.blank({ format: 'odf' });
    const { text } = textDocumentOutlineView({ name: 'Blank', document: blank, current: 't.0' });
    expect(text).toBe(
      'text-document "Blank" · odt · 1 document tab · 1 paragraph\ntab "Tab 1" ◂\n  empty',
    );
    const words = TextDocument.fromTexts(['Hello']);
    expect(textDocumentOutlineView({ name: 'W', document: words, current: 't.0' }).text).toContain(
      '  no headings',
    );
  });

  it('drops headings from the end to fit a budget, and says how many', () => {
    const view = textDocumentOutlineView(
      { name: 'Launch plan', document: doc, current: 't.0' },
      { budget: 40 },
    );
    expect(view.fit.state).toBe('lines-dropped');
    expect(view.text.split('\n').at(-1)).toMatch(/^… \d+ headings? hidden: view --budget \d+$/);
  });
});

describe('the text', () => {
  it('reads a document tab as its Markdown, paragraph numbers on request', async () => {
    const plain = textDocumentTextView({ document: doc, tab: plan });
    const numbered = textDocumentTextView({ document: doc, tab: plan, lines: true });
    if (!plain.ok || !numbered.ok) throw new Error('refused');
    await expect(plain.text).toMatchFileSnapshot(`${GOLDEN}/text.txt`);
    await expect(numbered.text).toMatchFileSnapshot(`${GOLDEN}/text-lines.txt`);
  });

  it('reads a range, a table’s rows by the paragraphs they hold', () => {
    const view = textDocumentTextView({ document: doc, tab: plan, range: '7..9', lines: true });
    if (!view.ok) throw new Error('refused');
    expect(view.text).toBe(
      [
        'text-document tab "Plan" · 16 paragraphs · ¶7..¶9',
        '¶7..¶8 | Who | What |',
        '| --- | --- |',
        '¶9..¶10 | Ada | Docs \\| site |',
      ].join('\n'),
    );
    expect(view.json.range).toBe('7..9');
  });

  it('refuses a range outside the tab’s paragraphs', () => {
    for (const range of ['0', '17', '5..3', 'a..b', '3..'])
      expect(textDocumentTextView({ document: doc, tab: plan, range }).ok).toBe(false);
    expect(parseParagraphRange('1', 0)).toMatchObject({ ok: false });
  });

  it('stops at a budget on a whole paragraph and names the rest and how to read it', () => {
    const view = textDocumentTextView(
      { document: doc, tab: plan, lines: true },
      { budget: 60, door: 'mcp' },
    );
    if (!view.ok) throw new Error('refused');
    const closing = view.text.split('\n').at(-1)!;
    expect(closing).toMatch(
      /^… ¶\d+\.\.¶16 left out: read_document \{"view":"text","range":"\d+\.\.16","lines":true\}$/,
    );
    expect(view.json.next).toMatch(/^\d+\.\.16$/);
    expect(view.fit.state).toBe('lines-dropped');
  });

  it('reads the second document tab by its name', () => {
    const notes = documentTabOf(doc, 'notes')!;
    const view = textDocumentTextView({ document: doc, tab: notes });
    expect(view.ok && view.text).toBe('text-document tab "Notes" · 1 paragraph\nLoose ends.');
    expect(documentTabOf(doc, 't.1')?.name).toBe('Notes');
    expect(documentTabOf(doc, 'nope')).toBeNull();
  });
});

describe('the structure', () => {
  it('lists paragraphs, tables, objects, comments and suggestions', async () => {
    const view = textDocumentStructureView({ document: doc, tab: plan });
    await expect(view.text).toMatchFileSnapshot(`${GOLDEN}/structure.txt`);
    expect(view.json.comments).toEqual([
      { id: 'c1', paragraph: 3, quote: 'We ship in May.', replies: 1, resolved: false },
    ]);
    expect(view.json.suggestions).toEqual([
      { id: 's1', kind: 'insertion', paragraph: 3, text: 'Truly', author: 'Ada' },
    ]);
  });

  it('says none for a tab with no comments or suggestions', () => {
    const blank = TextDocument.blank({ format: 'odf' });
    expect(
      textDocumentStructureView({ document: blank, tab: documentTabOf(blank, undefined)! }).json
        .comments,
    ).toEqual([]);
    const view = textDocumentStructureView({ document: doc, tab: documentTabOf(doc, 't.1')! });
    expect(view.text.split('\n').slice(-2)).toEqual(['comments none', 'suggestions none']);
  });
});

describe('the odds and ends', () => {
  const odds = oddsDocument();
  const tab = documentTabOf(odds, undefined)!;

  it('names every kind of block and object, and each thread and suggestion as it can', async () => {
    const view = textDocumentStructureView({ document: odds, tab });
    await expect(view.text).toMatchFileSnapshot(`${GOLDEN}/odds-structure.txt`);
    expect(view.json.comments).toEqual([
      { id: 'c2', paragraph: 6, quote: 'Settled words', replies: 0, resolved: true },
    ]);
    expect(view.json.suggestions.map((s) => [s.id, s.kind, s.author, s.text.length])).toEqual([
      ['s3', 'paragraph-break', 'Bo', 0],
      ['s2', 'deletion', null, 80],
    ]);
  });

  it('reads contents and kept content with the paragraph after them, and a one-column row by its paragraph', () => {
    const all = textDocumentTextView({ document: odds, tab, lines: true });
    expect(all.ok && all.text).toContain('- Intro\n\n¶4 | Solo |');
    const later = textDocumentTextView({ document: odds, tab, range: '5' });
    expect(later.ok && later.text).not.toContain('Intro');
    expect(later.ok && later.json.range).toBe('5');
  });

  it('reads a row that starts before the range asked', () => {
    const view = textDocumentTextView({ document: doc, tab: plan, range: '8..9' });
    expect(view.ok && view.text).toContain('| Who | What |');
  });

  it('names the document tab and the plain form in the closing line, the CLI’s by default', () => {
    const view = textDocumentTextView({ document: doc, tab: plan }, { budget: 40, only: 'Plan' });
    expect(view.ok && view.text.split('\n').at(-1)).toMatch(
      /^… ¶\d+\.\.¶16 left out: view --view text --only Plan --range \d+\.\.16$/,
    );
  });

  it('reads again the last paragraph when only its footnote was left out', () => {
    const notes = TextDocument.fromTexts(['One']);
    const withNote: TextDocument = {
      ...notes,
      body: [
        {
          ...(notes.body[0] as Extract<(typeof notes.body)[number], { type: 'paragraph' }>),
          inlines: [
            { type: 'run', text: 'One', props: {} },
            { type: 'note', blocks: TextDocument.fromTexts(['n'.repeat(300)]).body, props: {} },
          ],
        },
      ],
    };
    const view = textDocumentTextView(
      { document: withNote, tab: documentTabOf(withNote, undefined)! },
      { budget: 40 },
    );
    expect(view.ok && view.text.split('\n').at(-1)).toBe(
      '… ¶1 left out: view --view text --range 1',
    );
  });

  it('counts a paragraph holding only an object as something', () => {
    const { text } = textDocumentOutlineView({ name: 'Odds', document: odds, current: 't.0' });
    expect(text).not.toContain('empty');
  });
});
