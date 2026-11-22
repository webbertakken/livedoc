// @vitest-environment jsdom
// docs/specs/035-pdf-documents/live-editing-and-storage.md "A PDF document in This Browser": no room; the live
// changes are saved into the document's offline record, another browser tab's saves are never undone, nothing is
// refused or waits to be confirmed, and the save status says where the PDF is kept.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PdfLiveChanges } from '@livedoc/pdf-documents';
import { offlinePdfStateRead, offlineSavePdfState } from '@/lib/offline/offline-pdf-documents';
import { markIdsIn, pdfStateWith, pdfTab, testHighlight } from '@/lib/offline/offline-pdf-testing';
import { __setOfflineBackend, offlinePutRecord } from '@/lib/offline/offline-store';
import { memBackend, testRecord } from '@/lib/offline/offline-test-utils';
import { pdfLocalBinding } from './pdf-local-binding';

beforeEach(async () => {
  __setOfflineBackend(memBackend());
  await offlinePutRecord(testRecord({ id: 'D', tabs: [pdfTab('t1')] }));
});
afterEach(() => __setOfflineBackend(null));

const bindHere = async (over: { saveDelayMs?: number } = {}) =>
  pdfLocalBinding({ documentId: 'D', tabId: 't1', channel: () => null, saveDelayMs: 0, ...over })(
    await offlinePdfStateRead('D', 't1'),
  );
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('a PDF’s live changes bound to This Browser', () => {
  it('saves a change into the record, and reads it back when the PDF is opened again', async () => {
    const binding = await bindHere();
    expect(binding.isSaved()).toBe(true);
    PdfLiveChanges.addMark(binding.doc, testHighlight('mine'));
    expect(binding.isSaved()).toBe(false);
    expect(binding.saveStatus?.get()).toBe('saving');
    await tick();
    await binding.discard();
    expect(binding.isSaved()).toBe(true);
    // "Saved in this browser": the title row's status for a document kept here.
    expect(binding.saveStatus?.get()).toBe('this-browser');
    expect(markIdsIn((await offlinePdfStateRead('D', 't1')).update)).toEqual(['mine']);
    const again = await bindHere();
    expect(PdfLiveChanges.marks(again.doc).map((mark) => mark.id)).toEqual(['mine']);
    again.close();
  });

  it('starts from what another browser tab saved after the surface read the state', async () => {
    const read = await offlinePdfStateRead('D', 't1');
    await offlineSavePdfState('D', 't1', pdfStateWith(['theirs']));
    const binding = await pdfLocalBinding({ documentId: 'D', tabId: 't1', channel: () => null })(
      read,
    );
    expect(PdfLiveChanges.marks(binding.doc).map((mark) => mark.id)).toEqual(['theirs']);
    binding.close();
  });

  it('saves what is due as it closes', async () => {
    const binding = await bindHere({ saveDelayMs: 60_000 });
    PdfLiveChanges.addMark(binding.doc, testHighlight('closing'));
    binding.close();
    await tick();
    expect(markIdsIn((await offlinePdfStateRead('D', 't1')).update)).toEqual(['closing']);
  });

  // "nothing is refused for a level"; no room: nothing waits to be confirmed, and the stored file is not replaced.
  it('has nothing refused, nothing unconfirmed and no stored file replaced under it', async () => {
    const binding = await bindHere();
    const heard: string[] = [];
    binding.onRefused(() => heard.push('refused'))();
    binding.onMoved(() => heard.push('moved'))();
    PdfLiveChanges.addMark(binding.doc, testHighlight('mine'));
    expect(binding.unconfirmed()).toEqual([]);
    expect(binding.left).toEqual([]);
    expect(heard).toEqual([]);
    const watching = binding.saveStatus!.subscribe(() => {});
    watching();
    binding.close();
  });

  it('says a failed save, and is not saved until it is written', async () => {
    let fail = true;
    const binding = await pdfLocalBinding({
      documentId: 'D',
      tabId: 't1',
      channel: () => null,
      saveDelayMs: 0,
      retryDelayMs: 5,
      load: async () => null,
      save: async (update) => {
        if (fail) throw new Error('the record is gone');
        await offlineSavePdfState('D', 't1', update);
      },
    })(await offlinePdfStateRead('D', 't1'));
    PdfLiveChanges.addMark(binding.doc, testHighlight('late'));
    await tick();
    expect(binding.saveStatus?.get()).toBe('failed');
    expect(binding.isSaved()).toBe(false);
    fail = false;
    await tick();
    await tick();
    await tick();
    expect(binding.isSaved()).toBe(true);
    expect(markIdsIn((await offlinePdfStateRead('D', 't1')).update)).toEqual(['late']);
    binding.close();
  });

  it('rejects when the PDF is no longer in this browser', async () => {
    const read = await offlinePdfStateRead('D', 't1');
    __setOfflineBackend(memBackend());
    await expect(pdfLocalBinding({ documentId: 'D', tabId: 't1' })(read)).rejects.toMatchObject({
      code: 'pdf_not_found',
    });
  });
});
