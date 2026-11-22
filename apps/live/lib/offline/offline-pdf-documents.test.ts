// docs/specs/035-pdf-documents/live-editing-and-storage.md "A PDF document in This Browser": each PDF tab's live
// changes ride its record, a tab with none reads as its stored file unchanged, and a save merges into what is stored.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PdfLiveChanges } from '@livedoc/pdf-documents';
import { ApiError } from '../api/core';
import { offlinePdfStateRead, offlineSavePdfState } from './offline-pdf-documents';
import { markIdsIn, OTHER_PDF_BLOB, PDF_BLOB, pdfStateWith, pdfTab } from './offline-pdf-testing';
import {
  __setOfflineBackend,
  offlineGetRecord,
  offlinePutRecord,
  recordToSummary,
} from './offline-store';
import { memBackend, testRecord, testTab } from './offline-test-utils';

beforeEach(() => __setOfflineBackend(memBackend()));
afterEach(() => __setOfflineBackend(null));

const codeOf = (act: Promise<unknown>) =>
  act.then(
    () => null,
    (error: unknown) => (error instanceof ApiError ? error.code : `threw ${String(error)}`),
  );

describe('the live changes of a PDF tab in a record', () => {
  // "a tab with none reads as its stored file unchanged"
  it('reads a tab never changed as nothing changed, on the file the tab names', async () => {
    await offlinePutRecord(testRecord({ id: 'D', tabs: [pdfTab('t1')] }));
    const read = await offlinePdfStateRead('D', 't1');
    expect(read.storedFile).toBe(PDF_BLOB);
    expect(PdfLiveChanges.isEmpty(PdfLiveChanges.load([read.update]))).toBe(true);
    expect(PdfLiveChanges.isStateVector(read.stateVector)).toBe(true);
  });

  it('reads what was saved, and when, and marks the document saved', async () => {
    await offlinePutRecord(testRecord({ id: 'D', tabs: [pdfTab('t1')] }));
    await offlineSavePdfState('D', 't1', pdfStateWith(['one']), 50);
    const read = await offlinePdfStateRead('D', 't1');
    expect(markIdsIn(read.update)).toEqual(['one']);
    expect(read.stateVector).toEqual(PdfLiveChanges.stateVectorOf(read.update));
    const rec = await offlineGetRecord('D');
    expect(rec?.savedAt).toBe(50);
    expect(rec?.pdfDocuments).toEqual([
      { tabId: 't1', state: expect.any(Uint8Array), savedAt: 50 },
    ]);
  });

  // "each save merges into what is stored in one transaction, so another browser tab's saves are never undone"
  it('keeps another browser tab’s saves: each save merges into what is stored', async () => {
    await offlinePutRecord(
      testRecord({ id: 'D', tabs: [pdfTab('t1'), pdfTab('t2', OTHER_PDF_BLOB)] }),
    );
    await offlineSavePdfState('D', 't1', pdfStateWith(['one']));
    await offlineSavePdfState('D', 't1', pdfStateWith(['two']));
    await offlineSavePdfState('D', 't2', pdfStateWith(['other'], OTHER_PDF_BLOB));
    expect(markIdsIn((await offlinePdfStateRead('D', 't1')).update)).toEqual(['one', 'two']);
    expect(markIdsIn((await offlinePdfStateRead('D', 't2')).update)).toEqual(['other']);
    expect((await offlineGetRecord('D'))?.pdfDocuments).toHaveLength(2);
  });

  it('answers the stored file the changes name, which is the tab’s own until a change names one', async () => {
    await offlinePutRecord(testRecord({ id: 'D', tabs: [pdfTab('t1')] }));
    await offlineSavePdfState('D', 't1', pdfStateWith(['one'], null));
    expect((await offlinePdfStateRead('D', 't1')).storedFile).toBe(PDF_BLOB);
    await offlineSavePdfState('D', 't1', pdfStateWith(['two'], OTHER_PDF_BLOB));
    expect((await offlinePdfStateRead('D', 't1')).storedFile).toBe(OTHER_PDF_BLOB);
  });

  it('answers a tab that is no PDF tab of a document here as the room does', async () => {
    await offlinePutRecord(testRecord({ id: 'D', tabs: [pdfTab('t1'), testTab('canvas')] }));
    await offlinePutRecord(testRecord({ id: 'T', tabs: [pdfTab('t1')], trashedAt: 9 }));
    for (const [documentId, tabId] of [
      ['D', 'canvas'],
      ['D', 'missing'],
      ['T', 't1'],
      ['nowhere', 't1'],
    ] as const) {
      expect(await codeOf(offlinePdfStateRead(documentId, tabId))).toBe('pdf_not_found');
      expect(await codeOf(offlineSavePdfState(documentId, tabId, pdfStateWith(['x'])))).toBe(
        'pdf_not_found',
      );
    }
    expect((await offlineGetRecord('T'))?.pdfDocuments).toBeUndefined();
  });

  // "In the Explorer's lists it always has content: a PDF tab holds a file"
  it('lists a PDF document as having content, changed or not', async () => {
    expect(recordToSummary(testRecord({ id: 'D', tabs: [pdfTab('t1')] })).empty).toBe(false);
  });
});
