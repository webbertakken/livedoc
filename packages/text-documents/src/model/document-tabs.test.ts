// docs/specs/034-text-documents/text-document.md "What a document tab is", standard-mapping.md "Document tabs": the
// first tab's body is the document's, `tabs` names it and holds the others; tabs read are held to the rules.
import { describe, expect, it } from 'vitest';
import { Paragraph } from './blocks';
import {
  DocumentTabs,
  FIRST_DOCUMENT_TAB_ID,
  TEXT_DOCUMENT_MAX_TABS,
  TEXT_DOCUMENT_TAB_NAME_MAX,
  type DocumentTab,
} from './document-tabs';
import { TextDocument } from './text-document';

const blank = TextDocument.fromTexts(['First']);
const body = (text: string) => [Paragraph.of(text, 'Standard')];
const tab = (id: string, name: string, depth: 0 | 1 | 2, text: string): DocumentTab => ({
  id,
  name,
  depth,
  body: body(text),
});

describe('DocumentTabs', () => {
  it('reads a document without tabs as one tab, t.0, Tab 1, holding its body', () => {
    expect(DocumentTabs.all(blank)).toEqual([
      { id: FIRST_DOCUMENT_TAB_ID, name: 'Tab 1', depth: 0, body: blank.body },
    ]);
    expect(DocumentTabs.isPlain(blank)).toBe(true);
  });

  it('holds the first tab in the body and the others in tabs, and gives them back in order', () => {
    const doc = DocumentTabs.withAll(blank, [
      tab('t.0', 'Intro', 0, 'One'),
      tab('t.abc', 'Notes', 1, 'Two'),
    ]);
    expect(doc.body).toEqual(body('One'));
    expect(doc.tabs).toEqual({
      first: { id: 't.0', name: 'Intro' },
      more: [tab('t.abc', 'Notes', 1, 'Two')],
    });
    expect(DocumentTabs.all(doc).map((t) => t.name)).toEqual(['Intro', 'Notes']);
    expect(DocumentTabs.isPlain(doc)).toBe(false);
  });

  it('is plain again when the tabs are only Tab 1, t.0, without an emoji', () => {
    const doc = DocumentTabs.withAll(blank, [tab('t.0', 'Tab 1', 0, 'One')]);
    expect(doc.tabs).toBeUndefined();
    expect(
      DocumentTabs.isPlain(
        DocumentTabs.withAll(blank, [{ ...tab('t.0', 'Tab 1', 0, 'x'), emoji: '📌' }]),
      ),
    ).toBe(false);
    expect(DocumentTabs.isPlain(DocumentTabs.withAll(blank, [tab('t.9', 'Tab 1', 0, 'x')]))).toBe(
      false,
    );
  });

  it('walks every tab: its blocks, paragraphs and characters', () => {
    const doc = DocumentTabs.withAll(blank, [
      tab('t.0', 'A', 0, 'One'),
      tab('t.b', 'B', 0, 'Three'),
    ]);
    expect(DocumentTabs.blocks(doc)).toHaveLength(2);
    expect(TextDocument.paragraphTexts(doc)).toEqual(['One', 'Three']);
    expect(TextDocument.characters(doc)).toBe(8);
  });

  it('changes each tab body with mapBodies', () => {
    const doc = DocumentTabs.withAll(blank, [tab('t.0', 'A', 0, 'One'), tab('t.b', 'B', 0, 'Two')]);
    const emptied = DocumentTabs.mapBodies(doc, () => []);
    expect(DocumentTabs.all(emptied).map((t) => t.body)).toEqual([[], []]);
  });

  describe('held', () => {
    it('makes an id out of form, or one repeated, t.<n> by its place', () => {
      const held = DocumentTabs.held([
        { id: 't.0', name: 'A', body: [] },
        { id: 'T.Upper', name: 'B', body: [] },
        { id: 't.0', name: 'C', body: [] },
        { id: 't.ok9', name: 'D', body: [] },
      ]);
      expect(held.map((t) => t.id)).toEqual(['t.0', 't.1', 't.2', 't.ok9']);
    });

    it('skips past an id already taken when giving t.<n>', () => {
      const held = DocumentTabs.held([
        { id: 't.1', name: 'A', body: [] },
        { id: 'bad', name: 'B', body: [] },
      ]);
      expect(held.map((t) => t.id)).toEqual(['t.1', 't.2']);
    });

    it('names a tab without a name Tab N, and cuts a long one', () => {
      const held = DocumentTabs.held([
        { id: 't.0', name: '  ', body: [] },
        { id: 't.1', body: [] },
        { id: 't.2', name: 'x'.repeat(TEXT_DOCUMENT_TAB_NAME_MAX + 5), body: [] },
      ]);
      expect(held.map((t) => (t.name.length > 10 ? t.name.length : t.name))).toEqual([
        'Tab 1',
        'Tab 2',
        TEXT_DOCUMENT_TAB_NAME_MAX,
      ]);
    });

    it('starts at depth 0, goes at most one deeper than the tab before it, and never past 2', () => {
      const held = DocumentTabs.held([
        { depth: 2, body: [] },
        { depth: 2, body: [] },
        { depth: 1, body: [] },
        { depth: '2', body: [] },
        { depth: 5, body: [] },
        { depth: -1, body: [] },
        { depth: 'x', body: [] },
      ]);
      expect(held.map((t) => t.depth)).toEqual([0, 1, 1, 2, 2, 0, 0]);
    });

    it('keeps an emoji only when short enough', () => {
      const held = DocumentTabs.held([
        { emoji: '📌', body: [] },
        { emoji: 'x'.repeat(40), body: [] },
        { emoji: 3, body: [] },
      ]);
      expect(held.map((t) => t.emoji)).toEqual(['📌', undefined, undefined]);
    });

    it('joins tabs past the most into the last one held', () => {
      const read = Array.from({ length: TEXT_DOCUMENT_MAX_TABS + 2 }, (_, i) => ({
        id: `t.${i}`,
        body: body(String(i)),
      }));
      const held = DocumentTabs.held(read);
      expect(held).toHaveLength(TEXT_DOCUMENT_MAX_TABS);
      expect(held.at(-1)!.body.map((b) => Paragraph.text(b as Paragraph))).toEqual(['99', '100', '101']);
    });
  });

  it('makes a new id: t. and 12 lower-case letters and digits', () => {
    expect(DocumentTabs.newId()).toMatch(/^t\.[a-z0-9]{12}$/);
    expect(DocumentTabs.newId(() => 0)).toBe('t.aaaaaaaaaaaa');
    expect(DocumentTabs.newId(() => 0.9999)).toBe('t.999999999999');
  });
});
