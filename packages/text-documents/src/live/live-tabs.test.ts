// docs/specs/034-text-documents/live-editing-and-storage.md "The layout" (Document tabs), links-and-navigation.md
// "Document tabs in the outline" (Adding): the tab list in the outline's order, a tab added at the end of the top level
// with one empty paragraph, and every reader of the whole state (paragraphs, digest, stories) reading every tab.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { textDocumentDigest } from '../digest';
import { CONSTRUCTS } from '../testing/constructs';
import { TextDocumentState } from '../text-document-state';
import { readLiveDocument } from './live-read';
import { liveNoteIds, liveSectionHeaders } from './live-stories';
import { addLiveTab, liveTabIds, liveTabList } from './live-tabs';
import { writeLiveDocument } from './live-write';

const stateOf = (name: string) => {
  const doc = new Y.Doc();
  writeLiveDocument(doc, CONSTRUCTS[name]!('odf'));
  return doc;
};

describe('the live tab list', () => {
  it('is one tab, t.0, Tab 1, while the map holds none', () => {
    const doc = stateOf('text');
    expect(liveTabList(doc).map((t) => [t.id, t.name, t.depth])).toEqual([['t.0', 'Tab 1', 0]]);
    expect(liveTabIds(doc)).toEqual(['t.0']);
  });

  it('lists the tabs in the outline’s order with their heads and depths', () => {
    const doc = stateOf('tabs');
    expect(liveTabList(doc).map((t) => [t.id, t.name, t.emoji, t.depth])).toEqual([
      ['t.0', 'Overview', undefined, 0],
      ['t.k3x9q2m7p1zz', 'Details', '📌', 0],
      ['t.a1b2c3d4e5f6', 'Details', undefined, 1],
    ]);
  });
});

describe('addLiveTab', () => {
  it('adds a tab at the end of the top level, one empty paragraph in the style given, Tab 1 joining the map', () => {
    const doc = stateOf('text');
    addLiveTab(doc, { id: 't.new', name: 'Tab 2', style: 'Standard' });
    expect(liveTabList(doc).map((t) => [t.id, t.name, t.depth])).toEqual([
      ['t.0', 'Tab 1', 0],
      ['t.new', 'Tab 2', 0],
    ]);
    const read = readLiveDocument(doc, 'odf');
    expect(read.tabs?.more[0]?.body).toEqual([
      { type: 'paragraph', style: 'Standard', props: {}, inlines: [] },
    ]);
    expect(read.body).toEqual(CONSTRUCTS.text!('odf').body);
  });

  it('adds after the last tab whatever its order', () => {
    const doc = stateOf('tabs');
    addLiveTab(doc, { id: 't.z', name: 'Tab 4', style: 'Standard' });
    expect(liveTabIds(doc).at(-1)).toBe('t.z');
  });

  it('is one change, undone at once', () => {
    const doc = stateOf('text');
    const origin = { name: 'test' };
    const undo = new Y.UndoManager([doc.getMap('tabs'), TextDocumentState.tabBody(doc, 't.u')], {
      trackedOrigins: new Set([origin]),
    });
    addLiveTab(doc, { id: 't.u', name: 'Tab 2', style: 'Standard' }, origin);
    undo.undo();
    expect(liveTabIds(doc)).toEqual(['t.0']);
  });
});

describe('readers of the whole state', () => {
  it('read every tab’s paragraphs, in the outline’s order', () => {
    expect(TextDocumentState.paragraphs(stateOf('tabs')).map((p) => p.text)).toEqual([
      'Overview',
      'Details, portrait',
      'Details, landscape',
      'A subtab of the same name',
    ]);
  });

  it('count every tab in the digest', () => {
    const digest = textDocumentDigest(stateOf('tabs'));
    expect(digest.searchText).toContain('A subtab of the same name');
    expect(digest.words).toBe(11);
  });

  it('read a tab’s sections: the first section’s, then its own breaks', () => {
    const doc = stateOf('tabs');
    expect(liveSectionHeaders(doc, 't.k3x9q2m7p1zz')).toHaveLength(2);
    expect(liveSectionHeaders(doc, 't.a1b2c3d4e5f6')).toHaveLength(1);
  });

  it('find notes in every tab', () => {
    const doc = stateOf('footnotes');
    const ids = liveNoteIds(doc);
    addLiveTab(doc, { id: 't.b', name: 'Tab 2', style: 'Standard' });
    const notes = new Y.XmlElement('footnote');
    notes.setAttribute('story', 'n-in-tab');
    const paragraph = TextDocumentState.tabBody(doc, 't.b').get(0) as Y.XmlElement;
    paragraph.insert(0, [notes]);
    expect(liveNoteIds(doc)).toEqual([...ids, 'n-in-tab']);
  });
});
