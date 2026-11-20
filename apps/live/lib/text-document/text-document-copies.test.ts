// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { TEXT_DOCUMENT_COPIES_DB, TextDocumentCopies } from './text-document-copies';

// docs/specs/034-text-documents/live-editing-and-storage.md "The local copy": one record per document and tab in the
// `livedoc-text-documents` database's `copies` store.
describe('TextDocumentCopies', () => {
  const key = { documentId: 'D', tabId: 't1' };

  it('keeps one copy per document and tab, replaced by the next, and drops it', async () => {
    expect(await TextDocumentCopies.read(key)).toBeNull();
    await TextDocumentCopies.write({ ...key, update: Uint8Array.of(1, 2), savedAt: 5 });
    await TextDocumentCopies.write({ ...key, update: Uint8Array.of(3), savedAt: 6 });
    await TextDocumentCopies.write({
      documentId: 'D',
      tabId: 't2',
      update: Uint8Array.of(9),
      savedAt: 7,
    });
    expect(await TextDocumentCopies.read(key)).toEqual({
      ...key,
      update: Uint8Array.of(3),
      savedAt: 6,
    });
    await TextDocumentCopies.remove(key);
    expect(await TextDocumentCopies.read(key)).toBeNull();
    expect((await TextDocumentCopies.read({ documentId: 'D', tabId: 't2' }))?.savedAt).toBe(7);
  });

  it('reads a record in another shape as no copy', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(TEXT_DOCUMENT_COPIES_DB, 1);
      request.onsuccess = () => {
        const tx = request.result.transaction('copies', 'readwrite');
        tx.objectStore('copies').put({ documentId: 'X', tabId: 'y', update: 'nope' });
        tx.oncomplete = () => {
          request.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('write failed'));
      };
      request.onerror = () => reject(request.error ?? new Error('open failed'));
    });
    expect(await TextDocumentCopies.read({ documentId: 'X', tabId: 'y' })).toBeNull();
  });
});
