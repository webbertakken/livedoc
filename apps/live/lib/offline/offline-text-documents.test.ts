// docs/specs/034-text-documents/live-editing-and-storage.md "A text document in This Browser": each text document
// tab's state rides its record, and a save merges into what is stored.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Body, TextDocumentState } from '@livedoc/text-documents';
import {
  __setOfflineBackend,
  offlineGetRecord,
  offlinePutRecord,
  recordToSummary,
} from './offline-store';
import { memBackend, testRecord, testTab } from './offline-test-utils';
import { offlineSaveTextDocumentState, offlineTextDocumentState } from './offline-text-documents';

beforeEach(() => __setOfflineBackend(memBackend()));
afterEach(() => __setOfflineBackend(null));

/** Two browser tabs editing one text document from the same start, each its own words. */
function twoWriters() {
  const start = TextDocumentState.seed();
  const one = TextDocumentState.load([start]);
  const two = TextDocumentState.load([start]);
  TextDocumentState.replaceBody(one, Body.of('One'));
  TextDocumentState.replaceBody(two, Body.of('Two'));
  return [Y.encodeStateAsUpdate(one), Y.encodeStateAsUpdate(two)] as const;
}

describe('the text document state of a record', () => {
  it('reads none for a tab never saved, then the saved state', async () => {
    await offlinePutRecord(testRecord({ id: 'D' }));
    expect(await offlineTextDocumentState('D', 't1')).toBeNull();
    const update = TextDocumentState.fromBody(Body.of('Saved'));
    await offlineSaveTextDocumentState('D', 't1', update, 50);
    const state = await offlineTextDocumentState('D', 't1');
    expect(TextDocumentState.paragraphs(TextDocumentState.load([state!]))).toEqual(
      Body.of('Saved'),
    );
    const rec = await offlineGetRecord('D');
    expect(rec?.savedAt).toBe(50);
    expect(rec?.textDocuments).toEqual([
      { tabId: 't1', state: expect.any(Uint8Array), savedAt: 50 },
    ]);
  });

  it("keeps another browser tab's saves: each save merges into the stored state", async () => {
    await offlinePutRecord(testRecord({ id: 'D' }));
    const [one, two] = twoWriters();
    await offlineSaveTextDocumentState('D', 't1', one);
    await offlineSaveTextDocumentState('D', 't1', two);
    const merged = TextDocumentState.load([(await offlineTextDocumentState('D', 't1'))!]);
    const text = TextDocumentState.paragraphs(merged)
      .map((p) => p.text)
      .join('');
    expect(text).toContain('One');
    expect(text).toContain('Two');
  });

  it('refuses a record that is gone or in the Trash', async () => {
    await expect(offlineTextDocumentState('nope', 't1')).rejects.toMatchObject({ status: 404 });
    await offlinePutRecord(testRecord({ id: 'T', trashedAt: 1 }));
    await expect(
      offlineSaveTextDocumentState('T', 't1', TextDocumentState.seed()),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('a text document in the list', () => {
  it('has content once its writing has been saved', () => {
    const rec = testRecord({ tabs: [testTab('t1', { kind: 'text-document' })] });
    expect(recordToSummary(rec).empty).toBe(true);
    const saved = { ...rec, textDocuments: [{ tabId: 't1', state: Uint8Array.of(1), savedAt: 1 }] };
    expect(recordToSummary(saved).empty).toBe(false);
    expect(recordToSummary(testRecord()).empty).toBe(true);
  });
});
