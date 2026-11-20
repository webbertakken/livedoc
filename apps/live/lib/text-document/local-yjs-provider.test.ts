// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Body, TextDocumentState } from '@livedoc/text-documents';
import { openLocalYjs, type LocalYjsDeps } from './local-yjs-provider';

// docs/specs/034-text-documents/live-editing-and-storage.md "A text document in This Browser".

/** A store holding one state, merged as the record's is, and a channel joining the browser tabs made from it. */
function browser() {
  let stored: Uint8Array | null = null;
  const listeners = new Set<{ onmessage: ((e: MessageEvent) => void) | null }>();
  const save = vi.fn(async (update: Uint8Array) => {
    stored = stored ? Y.mergeUpdates([stored, update]) : update;
  });
  const tab = (over: Partial<LocalYjsDeps> = {}) =>
    openLocalYjs({
      documentId: 'D',
      tabId: 't1',
      canEdit: true,
      load: async () => stored,
      save,
      saveDelayMs: 0,
      channel: () => {
        const end = {
          onmessage: null as ((e: MessageEvent) => void) | null,
          postMessage: (data: unknown) => {
            for (const other of listeners)
              if (other !== end) other.onmessage?.({ data } as MessageEvent);
          },
          close: () => listeners.delete(end),
        };
        listeners.add(end);
        return end;
      },
      ...over,
    });
  const storedBody = () =>
    TextDocumentState.paragraphs(TextDocumentState.load(stored ? [stored] : []));
  return { tab, save, storedBody };
}

const type = (doc: Y.Doc, ...texts: string[]) =>
  TextDocumentState.replaceBody(doc, Body.of(...texts));
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('openLocalYjs', () => {
  it('starts from the seed, saves an edit after the delay, and reads it back next time', async () => {
    const b = browser();
    const first = await b.tab();
    expect(TextDocumentState.paragraphs(first.doc)).toEqual(Body.of(''));
    type(first.doc, 'Kept here');
    await tick();
    await first.settled();
    expect(b.storedBody()).toEqual(Body.of('Kept here'));
    first.close();
    const again = await b.tab();
    expect(TextDocumentState.paragraphs(again.doc)).toEqual(Body.of('Kept here'));
    again.close();
  });

  it('saves at once when the page is left, not after the delay', async () => {
    const b = browser();
    const binding = await b.tab({ saveDelayMs: 60_000 });
    type(binding.doc, 'Leaving');
    window.dispatchEvent(new Event('pagehide'));
    await binding.settled();
    expect(b.storedBody()).toEqual(Body.of('Leaving'));
    binding.close();
  });

  it("passes each edit to the browser's other tabs on the same text document", async () => {
    const b = browser();
    const one = await b.tab();
    const two = await b.tab();
    type(one.doc, 'From tab one');
    expect(TextDocumentState.paragraphs(two.doc)).toEqual(Body.of('From tab one'));
    one.close();
    two.close();
  });

  it('never saves for a session that may not edit', async () => {
    const b = browser();
    const binding = await b.tab({ canEdit: false });
    type(binding.doc, 'Not mine');
    binding.close();
    await binding.settled();
    expect(b.save).not.toHaveBeenCalled();
  });

  it('tries again with the next save when one fails', async () => {
    const b = browser();
    b.save.mockRejectedValueOnce(new Error('disk full'));
    const binding = await b.tab();
    type(binding.doc, 'Retried');
    await tick();
    await binding.settled();
    binding.close();
    await binding.settled();
    expect(b.save).toHaveBeenCalledTimes(2);
    expect(b.storedBody()).toEqual(Body.of('Retried'));
  });
});

// docs/specs/034-text-documents/editing-surface.md "The title row": what the save status reads.
describe('openLocalYjs save facts', () => {
  it('is pending while a write is due, then settled once written', async () => {
    const b = browser();
    const binding = await b.tab({ saveDelayMs: 10 });
    type(binding.doc, 'Here');
    expect(binding.saveFacts.get()).toEqual({ pending: true, failed: false });
    await tick();
    await tick();
    await binding.settled();
    expect(binding.saveFacts.get()).toEqual({ pending: false, failed: false });
    binding.close();
  });

  it('fails when a write fails, and writes again by itself after the retry delay', async () => {
    const b = browser();
    b.save.mockRejectedValueOnce(new Error('disk full'));
    const binding = await b.tab({ retryDelayMs: 5 });
    type(binding.doc, 'Kept');
    await tick();
    await binding.settled();
    expect(binding.saveFacts.get()).toEqual({ pending: true, failed: true });
    await tick();
    await tick();
    await binding.settled();
    expect(b.save).toHaveBeenCalledTimes(2);
    expect(b.storedBody()).toEqual(Body.of('Kept'));
    expect(binding.saveFacts.get()).toEqual({ pending: false, failed: false });
    binding.close();
  });
});
