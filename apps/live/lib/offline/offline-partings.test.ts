// @vitest-environment jsdom
// docs/specs/035-pdf-documents/live-editing-and-storage.md "A page's last moment": a parting copy left behind joins
// the record before Sync Document or Duplicate reads it, and goes with a record that is deleted.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { partingCopy } from '../live-tab/live-tab-parting';
import { LIVE_TAB_PARTING_PREFIX } from '../live-tab/live-tab-parting-keys';
import { offlineRecordWithPartings } from './offline-partings';
import { offlineJoinPdfPartingCopies, offlineSavePdfState } from './offline-pdf-documents';
import { markIdsIn, OTHER_PDF_BLOB, pdfStateWith, pdfTab } from './offline-pdf-testing';
import {
  __setOfflineBackend,
  OfflineDocumentMissingError,
  offlineDeleteDocument,
  offlineDeleteIfUnchanged,
  offlineGetRecord,
  offlinePutRecord,
  offlineSaveTab,
  offlineUpdateRecord,
} from './offline-store';
import { memBackend, testRecord, testTab } from './offline-test-utils';

const TAG = '[pdf]';
const left = (documentId: string, tabId: string, ids: readonly string[], writer = 'w1') =>
  partingCopy(localStorage, { documentId, tabId, tag: TAG }, writer).write(pdfStateWith(ids));
const copies = () =>
  Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((key) =>
    key.startsWith(LIVE_TAB_PARTING_PREFIX),
  );
const marksOf = async (documentId: string, tabId: string) => {
  const state = (await offlineGetRecord(documentId))?.pdfDocuments?.find((t) => t.tabId === tabId);
  return state ? markIdsIn(state.state) : [];
};

beforeEach(() => {
  localStorage.clear();
  __setOfflineBackend(memBackend());
});
afterEach(() => __setOfflineBackend(null));

describe('a record read with what a closing page left', () => {
  it('is the record itself when nothing was left, and nothing of a PDF is read', async () => {
    const rec = testRecord({ id: 'D', tabs: [pdfTab('t1')] });
    await offlinePutRecord(rec);
    expect(await offlineRecordWithPartings(rec)).toBe(rec);
  });

  // "One left behind joins the record ... before Sync Document or Duplicate reads the record"
  it('holds each PDF tab’s parting copy, which is then gone', async () => {
    const rec = testRecord({ id: 'D', tabs: [pdfTab('t1'), pdfTab('t2', OTHER_PDF_BLOB)] });
    await offlinePutRecord(rec);
    await offlineSavePdfState('D', 't1', pdfStateWith(['saved']));
    left('D', 't1', ['late']);
    left('D', 't1', ['later'], 'w2');
    const read = await offlineRecordWithPartings(rec);
    expect(markIdsIn(read.pdfDocuments!.find((t) => t.tabId === 't1')!.state).toSorted()).toEqual([
      'late',
      'later',
      'saved',
    ]);
    expect(await marksOf('D', 't2')).toEqual([]);
    expect(copies()).toEqual([]);
  });

  it('is the record as handed when what was left joins nothing', async () => {
    const rec = testRecord({ id: 'D', tabs: [pdfTab('t1')] });
    await offlinePutRecord(rec);
    localStorage.setItem(`${LIVE_TAB_PARTING_PREFIX}D:t1:w1`, 'unreadable');
    expect(await offlineRecordWithPartings(rec)).toBe(rec);
    expect(copies()).toEqual([]);
  });

  it('is the record as handed when it went meanwhile', async () => {
    // A store that writes and then no longer reads the record: it was removed between the two.
    __setOfflineBackend({ ...memBackend(), get: async () => undefined });
    const rec = testRecord({ id: 'D', tabs: [pdfTab('t1')] });
    await offlinePutRecord(rec);
    left('D', 't1', ['late']);
    expect(await offlineRecordWithPartings(rec)).toBe(rec);
    expect(copies()).toEqual([]);
  });

  it('reads the browser’s own storage unless handed another', async () => {
    const rec = testRecord({ id: 'D', tabs: [pdfTab('t1')] });
    await offlinePutRecord(rec);
    left('D', 't1', ['late']);
    expect(await offlineRecordWithPartings(rec, null)).toBe(rec);
    expect(copies()).toHaveLength(1);
  });
});

describe('the parting copies of a record’s PDF tabs', () => {
  it('join the PDF tabs alone, and say how many joined', async () => {
    const rec = testRecord({ id: 'D', tabs: [pdfTab('t1'), testTab('canvas')] });
    await offlinePutRecord(rec);
    left('D', 't1', ['late']);
    left('D', 'canvas', ['never']);
    expect(await offlineJoinPdfPartingCopies(rec, localStorage)).toBe(1);
    expect(await marksOf('D', 't1')).toEqual(['late']);
    expect(copies()).toEqual([`${LIVE_TAB_PARTING_PREFIX}D:canvas:w1`]);
  });

  it('stay when the record is in the local Trash', async () => {
    const rec = testRecord({ id: 'D', tabs: [pdfTab('t1')] });
    await offlinePutRecord(rec);
    await offlineUpdateRecord('D', (now) => ({ ...now!, trashedAt: 5 }));
    left('D', 't1', ['late']);
    expect(await offlineJoinPdfPartingCopies(rec, localStorage)).toBe(0);
    expect(copies()).toHaveLength(1);
  });
});

// "it goes with a record that is deleted"
describe('a record that goes', () => {
  let backend = memBackend();
  beforeEach(async () => {
    backend = memBackend();
    __setOfflineBackend(backend);
    await offlinePutRecord(testRecord({ id: 'D', savedAt: 5, tabs: [pdfTab('t1')] }));
    await offlinePutRecord(testRecord({ id: 'E', tabs: [pdfTab('t1')] }));
    left('D', 't1', ['late']);
    left('E', 't1', ['kept']);
  });
  const kept = [`${LIVE_TAB_PARTING_PREFIX}E:t1:w1`];

  it('takes its parting copies when it is deleted', async () => {
    await offlineDeleteDocument('D');
    expect(copies()).toEqual(kept);
  });

  it('takes them when a sync removes it, and keeps them when it changed', async () => {
    await offlineDeleteIfUnchanged('D', () => false);
    expect(copies()).toHaveLength(2);
    await offlineDeleteIfUnchanged('D', () => true);
    expect(copies()).toEqual(kept);
  });

  it('takes them when a write finds it gone', async () => {
    // Another browser tab synced or purged it, and this one missed the message.
    await backend.delete('D');
    await expect(offlineSaveTab('D', testTab('t9'), 6)).rejects.toBeInstanceOf(
      OfflineDocumentMissingError,
    );
    expect(copies()).toEqual(kept);
  });
});
