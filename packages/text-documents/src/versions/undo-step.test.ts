import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { TextDocumentState } from '../text-document-state';
import { UndoSteps } from './undo-step';

const written = (doc: Y.Doc, write: () => void) => {
  const before = Y.snapshot(doc);
  write();
  return UndoSteps.between(before, Y.snapshot(doc));
};

describe('UndoSteps', () => {
  it('reads what a change wrote and deleted, and encodes it whole', () => {
    const doc = TextDocumentState.load([TextDocumentState.fromBody([{ text: 'Hello world' }])]);
    const step = written(doc, () => {
      const text = TextDocumentState.body(doc).get(0) as Y.XmlElement;
      const run = text.get(0) as Y.XmlText;
      run.delete(0, 6);
      run.insert(0, 'Brave ');
    });
    expect(UndoSteps.isEmpty(step)).toBe(false);
    const read = UndoSteps.decode(UndoSteps.encode(step))!;
    expect(read.insertions.clients).toEqual(step.insertions.clients);
    expect(read.deletions.clients).toEqual(step.deletions.clients);
    const update = UndoSteps.undoUpdate(doc, read)!;
    expect(update).toBeInstanceOf(Uint8Array);
    expect(TextDocumentState.paragraphs(doc).map((p) => p.text)).toEqual(['Hello world']);
  });

  it('undoes nothing for an empty step', () => {
    const doc = TextDocumentState.load();
    const step = written(doc, () => {});
    expect(UndoSteps.isEmpty(step)).toBe(true);
    expect(UndoSteps.undoUpdate(doc, step)).toBeNull();
  });

  it('reads no step from bytes that are not one', () => {
    expect(UndoSteps.decode(new Uint8Array([1]))).toBeNull();
    expect(UndoSteps.decode(new Uint8Array([0, 0, 0, 9, 1]))).toBeNull();
    expect(UndoSteps.decode(new Uint8Array([0, 0, 0, 1, 255, 255]))).toBeNull();
  });
});
