import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { Body } from './body';
import { TEXT_DOCUMENT_SEED_CLIENT, TextDocumentState } from './text-document-state';

const typeInto = (doc: Y.Doc, index: number, at: number, text: string) => {
  const paragraph = TextDocumentState.body(doc).get(index) as Y.XmlElement;
  let node = paragraph.get(0) as Y.XmlText | undefined;
  if (!node) {
    node = new Y.XmlText();
    paragraph.insert(0, [node]);
  }
  node.insert(at, text);
};

// docs/specs/034-text-documents/live-editing-and-storage.md "Storage": every state is the seed merged with what is
// stored, so no surface invents a first paragraph.
describe('TextDocumentState', () => {
  it('starts from one empty paragraph, written by the seed client', () => {
    const doc = TextDocumentState.load();
    expect(TextDocumentState.paragraphs(doc)).toEqual([{ text: '' }]);
    expect([...doc.store.clients.keys()]).toEqual([TEXT_DOCUMENT_SEED_CLIENT]);
  });

  it('pins the seed to the bytes Yjs writes for it', () => {
    const doc = new Y.Doc({ gc: false });
    doc.clientID = TEXT_DOCUMENT_SEED_CLIENT;
    TextDocumentState.body(doc).insert(0, [new Y.XmlElement('paragraph')]);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(TextDocumentState.seed());
  });

  it('merges the seed with itself, so two first opens keep one paragraph', () => {
    const doc = TextDocumentState.load([TextDocumentState.seed(), TextDocumentState.seed()]);
    expect(TextDocumentState.paragraphs(doc)).toHaveLength(1);
  });

  // "The live model": concurrent edits merge by character.
  it('keeps every character two people type into one paragraph at once', () => {
    const a = TextDocumentState.load();
    const b = TextDocumentState.load();
    typeInto(a, 0, 0, 'Hello');
    Y.applyUpdate(b, TextDocumentState.encode(a));
    typeInto(a, 0, 5, ' world');
    typeInto(b, 0, 0, 'Oh. ');
    const merged = TextDocumentState.load([
      TextDocumentState.encode(a),
      TextDocumentState.encode(b),
    ]);
    expect(TextDocumentState.paragraphs(merged)).toEqual([{ text: 'Oh. Hello world' }]);
  });

  it('merges updates without a live document, as the room stores them', () => {
    const doc = TextDocumentState.load();
    typeInto(doc, 0, 0, 'Stored');
    const merged = TextDocumentState.merge([TextDocumentState.encode(doc)]);
    expect(TextDocumentState.paragraphs(TextDocumentState.load([merged]))).toEqual(
      Body.of('Stored'),
    );
  });

  it('builds a state from a body, and an empty body keeps one paragraph', () => {
    const state = TextDocumentState.fromBody(Body.of('One', '', 'Three'));
    expect(TextDocumentState.paragraphs(TextDocumentState.load([state]))).toEqual(
      Body.of('One', '', 'Three'),
    );
    const empty = TextDocumentState.fromBody([]);
    expect(TextDocumentState.paragraphs(TextDocumentState.load([empty]))).toEqual(Body.of(''));
  });

  it('reads only paragraphs, and only their text', () => {
    const doc = TextDocumentState.load();
    const body = TextDocumentState.body(doc);
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('a'), new Y.XmlElement('image')]);
    body.insert(1, [paragraph, new Y.XmlElement('table')]);
    const text = paragraph.get(0) as Y.XmlText;
    text.insertEmbed(1, { kind: 'chip' });
    expect(TextDocumentState.paragraphs(doc)).toEqual(Body.of('', 'a'));
  });

  it('refuses bytes that are not an update', () => {
    expect(TextDocumentState.decodes(TextDocumentState.seed())).toBe(true);
    expect(TextDocumentState.decodes(Uint8Array.of(9, 9, 9))).toBe(false);
  });

  // live-editing-and-storage.md "Reconnecting": a catch-up reads only what it lacks, and learns what the room holds.
  it("answers what a state holds beyond a reader's state vector", () => {
    const reader = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Kept'))]);
    const room = TextDocumentState.load([TextDocumentState.encode(reader)]);
    TextDocumentState.replaceBody(room, Body.of('Kept', 'Added'));
    const state = TextDocumentState.encode(room);
    const vector = TextDocumentState.stateVectorOf(TextDocumentState.encode(reader));
    expect(TextDocumentState.isStateVector(vector)).toBe(true);
    expect(TextDocumentState.isStateVector(Uint8Array.of(200))).toBe(false);
    const missing = TextDocumentState.since(state, vector);
    expect(missing.byteLength).toBeLessThan(state.byteLength);
    Y.applyUpdate(reader, missing);
    expect(TextDocumentState.paragraphs(reader)).toEqual(Body.of('Kept', 'Added'));
  });
});

describe('Body', () => {
  it('reads as plain text and counts its characters', () => {
    const body = Body.of('ab', 'c');
    expect(Body.plainText(body)).toBe('ab\nc');
    expect(Body.characters(body)).toBe(3);
  });
});
