// docs/specs/034-text-documents/agents-and-sync.md "Reading": a document tab's Markdown in pieces for an agent's text
// view, each paragraph with its number, a table's rows with theirs, pending suggestions in CriticMarkup.
import { describe, expect, it } from 'vitest';
import { CONSTRUCTS } from '../testing/constructs';
import { ParagraphRefs } from '../model/paragraph-refs';
import { TextDocument } from '../model/text-document';
import { DocumentTabs } from '../model/document-tabs';
import { tabMarkdown, writeMarkdown } from './markdown';

describe('ParagraphRefs', () => {
  it('numbers a tab’s paragraphs from 1, a table’s row by row, and writes ¶<n>', () => {
    const doc = CONSTRUCTS.tables!('odf');
    const paragraphs = ParagraphRefs.of(doc.body);
    const numbers = ParagraphRefs.numbers(doc.body);
    expect(paragraphs.map((p) => numbers.get(p))).toEqual(paragraphs.map((_, i) => i + 1));
    expect(ParagraphRefs.text(12)).toBe('¶12');
  });
});

describe('tabMarkdown', () => {
  it('gives each paragraph its number and Markdown, as the download writes it', () => {
    const doc = TextDocument.fromTexts(['One', '', 'Three']);
    const read = tabMarkdown(doc, 't.0')!;
    expect(read.pieces).toEqual([
      { kind: 'paragraph', number: 1, text: 'One', tight: false },
      { kind: 'paragraph', number: 2, text: '', tight: false },
      { kind: 'paragraph', number: 3, text: 'Three', tight: false },
    ]);
    expect(writeMarkdown(doc)).toBe('One\n\nThree\n');
  });

  it('gives a table’s rows the paragraphs they hold', () => {
    const doc = CONSTRUCTS.tables!('ooxml');
    const table = tabMarkdown(doc, 't.0')!.pieces.find((p) => p.kind === 'table')!;
    expect(table.kind === 'table' && table.rows[0]).toMatchObject({ first: expect.any(Number) });
    expect(table.kind === 'table' && table.rule).toMatch(/^\|( --- \|)+$/);
  });

  it('marks pending suggestions in CriticMarkup, which the download settles', () => {
    const doc = CONSTRUCTS.suggestions!('odf');
    const text = tabMarkdown(doc, 't.0')!
      .pieces.map((p) => (p.kind === 'paragraph' ? p.text : ''))
      .join('\n');
    expect(text).toMatch(/\{\+\+.+?\+\+\}/);
    expect(text).toMatch(/\{--.+?--\}/);
    expect(writeMarkdown(doc)).not.toMatch(/\{\+\+|\{--/);
  });

  it('reads another document tab, and none for an id the document lacks', () => {
    const doc = CONSTRUCTS.tabs!('odf');
    const [, second] = DocumentTabs.all(doc);
    expect(tabMarkdown(doc, second!.id)!.pieces.length).toBeGreaterThan(0);
    expect(tabMarkdown(doc, 'nope')).toBeNull();
  });

  it('keeps footnotes with the paragraph their mark sits in', () => {
    const doc = CONSTRUCTS.footnotes!('odf');
    const { notes } = tabMarkdown(doc, 't.0')!;
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]!.text).toMatch(/^\[\^1\]: /);
    expect(notes[0]!.paragraph).toBeGreaterThan(0);
  });
});
