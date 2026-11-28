// docs/specs/034-text-documents/standard-mapping.md "Conversion": one undo puts the format and everything the
// conversion changed back, kept content and stories included; one redo makes it again.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { readTextDocumentFile, TextDocumentState } from '@livedoc/text-documents';
import {
  TEXT_DOCUMENT_CONVERSION_ORIGIN,
  textDocumentConversion,
} from './text-document-conversion';

const CORPUS = join(import.meta.dirname, '../../../../packages/text-documents/corpus');
const TYPING = Symbol('typing');

async function features() {
  const read = await readTextDocumentFile(readFileSync(join(CORPUS, 'libreoffice/features.odt')));
  if (!read.ok) throw new Error(read.rejection);
  const doc = TextDocumentState.load([TextDocumentState.fromDocument(read.document)]);
  // The body's undo manager as the editor makes it (text-document-undo.ts): the writing, styles, lists and page.
  const body = new Y.UndoManager(
    [
      TextDocumentState.body(doc),
      TextDocumentState.stylesType(doc),
      TextDocumentState.listsType(doc),
      TextDocumentState.metaType(doc),
    ],
    { trackedOrigins: new Set([TYPING]) },
  );
  return { doc, body };
}

const held = (doc: Y.Doc, format: 'odf' | 'ooxml') =>
  JSON.stringify(TextDocumentState.document(doc, format));

describe('textDocumentConversion', () => {
  it('converts, names the new format, and is one undo step', async () => {
    const { doc, body } = await features();
    const setFormat = vi.fn();
    const conversion = textDocumentConversion(doc, body, setFormat);
    const losses = conversion.convert('odf', 'ooxml');
    expect(losses.some((loss) => loss.kind === 'kept')).toBe(true);
    expect(setFormat).toHaveBeenCalledWith('ooxml');
    expect(body.undoStack).toHaveLength(1);
    expect(TextDocumentState.styles(doc, 'ooxml').some((s) => s.id === 'Heading1')).toBe(true);
    conversion.destroy();
  });

  it('puts everything back on undo, stories and kept content too, and converts again on redo', async () => {
    const { doc, body } = await features();
    const before = held(doc, 'odf');
    const setFormat = vi.fn();
    const conversion = textDocumentConversion(doc, body, setFormat);
    conversion.convert('odf', 'ooxml');
    const after = held(doc, 'ooxml');
    body.undo();
    expect(held(doc, 'odf')).toBe(before);
    expect(setFormat).toHaveBeenLastCalledWith('odf');
    body.redo();
    expect(held(doc, 'ooxml')).toBe(after);
    expect(setFormat).toHaveBeenLastCalledWith('ooxml');
    body.undo();
    expect(held(doc, 'odf')).toBe(before);
    expect(setFormat).toHaveBeenLastCalledWith('odf');
    conversion.destroy();
  });

  it('keeps the typing before it a step of its own', async () => {
    const { doc, body } = await features();
    const conversion = textDocumentConversion(doc, body, vi.fn());
    doc.transact(() => TextDocumentState.setSummary(doc, 'typed'), TYPING);
    conversion.convert('odf', 'ooxml');
    expect(body.undoStack).toHaveLength(2);
    body.undo();
    expect(TextDocumentState.summary(doc)).toBe('typed');
    conversion.destroy();
  });

  it('leaves the format alone when converting throws', async () => {
    const { doc, body } = await features();
    const setFormat = vi.fn();
    const conversion = textDocumentConversion(doc, body, setFormat);
    const spy = vi.spyOn(TextDocumentState, 'convert').mockImplementation(() => {
      throw new Error('broken');
    });
    expect(() => conversion.convert('odf', 'ooxml')).toThrow('broken');
    expect(setFormat).not.toHaveBeenCalled();
    spy.mockRestore();
    conversion.destroy();
  });

  it('follows no undo once destroyed, and tracks its origin only', async () => {
    const { doc, body } = await features();
    const setFormat = vi.fn();
    const conversion = textDocumentConversion(doc, body, setFormat);
    conversion.convert('odf', 'ooxml');
    conversion.destroy();
    setFormat.mockClear();
    body.undo();
    expect(setFormat).not.toHaveBeenCalled();
    expect(body.trackedOrigins.has(TEXT_DOCUMENT_CONVERSION_ORIGIN)).toBe(true);
  });
});
