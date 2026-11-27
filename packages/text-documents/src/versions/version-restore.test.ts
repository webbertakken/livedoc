import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { THREADS_MAP } from '../live/live-names';
import { TextDocumentState } from '../text-document-state';
import { restoreUpdate, STACK_ITEM_FIELDS, versionDocument } from './version-restore';

const textOf = (doc: Y.Doc) => TextDocumentState.paragraphs(doc).map((p) => p.text);

function paragraph(text: string): Y.XmlElement {
  const element = new Y.XmlElement('paragraph');
  element.insert(0, [new Y.XmlText(text)]);
  return element;
}

// The stored state as the room holds it: one update, written by a person's browser.
function edited(state: Uint8Array, edit: (doc: Y.Doc) => void): Uint8Array {
  const doc = TextDocumentState.load([state]);
  edit(doc);
  return Y.encodeStateAsUpdate(doc);
}

function start(): Uint8Array {
  return edited(new Uint8Array(Y.encodeStateAsUpdate(new Y.Doc())), (doc) => {
    const body = TextDocumentState.body(doc);
    body.delete(0, body.length);
    body.insert(0, [paragraph('First line'), paragraph('Second line'), paragraph('Third line')]);
    doc.getMap('styles').set('heading', { size: 20 });
  });
}

const snapshotOf = (state: Uint8Array) =>
  Y.encodeSnapshot(Y.snapshot(TextDocumentState.load([state])));

function restored(state: Uint8Array, version: Uint8Array): Y.Doc {
  const update = restoreUpdate([state], version);
  expect(update).not.toBeNull();
  return TextDocumentState.load([state, update!]);
}

describe('restoreUpdate', () => {
  it('brings back text, a paragraph and a style as the version had them', () => {
    const v1 = start();
    const version = snapshotOf(v1);
    const later = edited(v1, (doc) => {
      const body = TextDocumentState.body(doc);
      ((body.get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(5, ' new');
      body.delete(1, 1);
      body.insert(2, [paragraph('Added')]);
      doc.getMap('styles').set('heading', { size: 30 });
    });
    const doc = restored(later, version);
    expect(textOf(doc)).toEqual(['First line', 'Second line', 'Third line']);
    expect(doc.getMap('styles').get('heading')).toEqual({ size: 20 });
  });

  it('is one minimal change: what stayed unchanged keeps its identity', () => {
    const v1 = start();
    const version = snapshotOf(v1);
    const before = TextDocumentState.load([v1]);
    const third = (TextDocumentState.body(before).get(2) as Y.XmlElement).get(0) as Y.XmlText;
    const anchor = Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(third, 3));
    const later = edited(v1, (doc) => TextDocumentState.body(doc).delete(0, 1));
    const doc = restored(later, version);
    const at = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(anchor), doc);
    expect(at?.index).toBe(3);
    expect(textOf(doc)).toEqual(['First line', 'Second line', 'Third line']);
  });

  it('leaves comment threads made since as they are', () => {
    const v1 = start();
    const version = snapshotOf(v1);
    const later = edited(v1, (doc) => {
      doc.getMap(THREADS_MAP).set('t1', { id: 't1' });
      TextDocumentState.body(doc).delete(0, 1);
    });
    const doc = restored(later, version);
    expect(doc.getMap(THREADS_MAP).get('t1')).toEqual({ id: 't1' });
  });

  it('keeps an edit made at the same time on top of the restore', () => {
    const v1 = start();
    const version = snapshotOf(v1);
    const later = edited(v1, (doc) => TextDocumentState.body(doc).delete(2, 1));
    // Someone typing on the state the restore read, their update arriving after the restore's.
    const theirs = TextDocumentState.load([later]);
    const before = Y.encodeStateVector(theirs);
    ((TextDocumentState.body(theirs).get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(
      0,
      'Typed ',
    );
    const typed = Y.encodeStateAsUpdate(theirs, before);
    const update = restoreUpdate([later], version)!;
    const doc = TextDocumentState.load([later, update, typed]);
    expect(textOf(doc)).toEqual(['Typed First line', 'Second line', 'Third line']);
  });

  it('answers null when the state already reads as the version', () => {
    const v1 = start();
    expect(restoreUpdate([v1], snapshotOf(v1))).toBeNull();
  });

  it('restores a version from before a restore', () => {
    const v1 = start();
    const version = snapshotOf(v1);
    const v2 = edited(v1, (doc) => TextDocumentState.body(doc).delete(0, 2));
    const back = Y.mergeUpdates([v2, restoreUpdate([v2], version)!]);
    const v2snapshot = snapshotOf(v2);
    const again = TextDocumentState.load([back, restoreUpdate([back], v2snapshot)!]);
    expect(textOf(again)).toEqual(['Third line']);
  });

  it('relies on the fields Yjs’s own undo stack items hold', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    const um = new Y.UndoManager(text);
    text.insert(0, 'x');
    expect(Object.keys(um.undoStack[0]!).sort()).toEqual([...STACK_ITEM_FIELDS].sort());
  });
});

describe('versionDocument', () => {
  it('reads the document as it stood at the version', () => {
    const v1 = start();
    const version = snapshotOf(v1);
    const later = edited(v1, (doc) => TextDocumentState.body(doc).delete(0, 2));
    expect(textOf(versionDocument([later], version))).toEqual([
      'First line',
      'Second line',
      'Third line',
    ]);
  });
});
