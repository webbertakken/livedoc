// @vitest-environment jsdom
// docs/specs/035-pdf-documents/live-editing-and-storage.md "A PDF document in This Browser"; docs/specs/006-document/
// kinds-outside-the-canvas.md "Live state": a live tab kind in This Browser saves a moment after a change and at
// once when the page is hidden or the tab closes, merges into what is stored, and passes each change to the
// browser's other tabs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  openLiveTabLocal,
  type LiveTabLocalDeps,
  type LiveTabLocalKind,
} from './live-tab-local-binding';
import { LIVE_TAB_PARTING_PREFIX } from './live-tab-parting-keys';

const KIND: LiveTabLocalKind = {
  tag: '[kind]',
  channel: 'livedoc-kind',
  saveMs: 0,
  retryMs: 60_000,
  load: (updates) => {
    const doc = new Y.Doc();
    for (const update of updates) Y.applyUpdate(doc, update);
    return doc;
  },
};

const words = (doc: Y.Doc) => doc.getArray<string>('words').toArray();
const write = (doc: Y.Doc, word: string) => doc.getArray<string>('words').push([word]);
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** A store holding one state, merged as a record's is, and a channel joining the browser tabs made from it. */
function browser() {
  let stored: Uint8Array | null = null;
  const ends = new Set<{ onmessage: ((e: MessageEvent) => void) | null }>();
  const save = vi.fn(async (update: Uint8Array) => {
    stored = stored ? Y.mergeUpdates([stored, update]) : update;
  });
  const tab = (over: Partial<LiveTabLocalDeps> = {}, kind: LiveTabLocalKind = KIND) =>
    openLiveTabLocal(kind, {
      documentId: 'D',
      tabId: 't1',
      canEdit: true,
      load: async () => stored,
      save,
      channel: () => {
        const end = {
          onmessage: null as ((e: MessageEvent) => void) | null,
          postMessage: (data: unknown) => {
            for (const other of ends)
              if (other !== end) other.onmessage?.({ data } as MessageEvent);
          },
          close: () => ends.delete(end),
        };
        ends.add(end);
        return end;
      },
      ...over,
    });
  const storedWords = () => words(KIND.load(stored ? [stored] : []));
  return { tab, save, storedWords, ends };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const partingCopies = () =>
  Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((key) =>
    key.startsWith(LIVE_TAB_PARTING_PREFIX),
  );
/** A save the test ends itself, as a store's write that outlives its page or not. */
function heldSave() {
  let land = () => {};
  const held = new Promise<void>((resolve) => {
    land = resolve;
  });
  return { held, land };
}

describe('a live tab kind in This Browser', () => {
  it('starts from nothing, saves a change after the delay, and reads it back next time', async () => {
    const b = browser();
    const first = await b.tab();
    expect(words(first.doc)).toEqual([]);
    write(first.doc, 'kept');
    await tick();
    await first.settled();
    expect(b.storedWords()).toEqual(['kept']);
    first.close();
    const again = await b.tab();
    expect(words(again.doc)).toEqual(['kept']);
    again.close();
  });

  it('sends only what changed since the last save', async () => {
    const b = browser();
    const binding = await b.tab();
    write(binding.doc, 'one');
    await tick();
    await binding.settled();
    write(binding.doc, 'two');
    await tick();
    await binding.settled();
    const second = KIND.load([b.save.mock.calls[1]![0]]);
    // The second save holds the second word alone, pending the first it stands on.
    expect(words(second)).toEqual([]);
    expect(b.storedWords()).toEqual(['one', 'two']);
    binding.close();
  });

  // "at once when the page is hidden or the tab closes"
  it('saves at once when the page is left or hidden, not after the delay', async () => {
    const b = browser();
    const binding = await b.tab({ saveDelayMs: 60_000 });
    write(binding.doc, 'leaving');
    window.dispatchEvent(new Event('pagehide'));
    await binding.settled();
    expect(b.storedWords()).toEqual(['leaving']);
    write(binding.doc, 'hidden');
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await binding.settled();
    expect(b.storedWords()).toEqual(['leaving']);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await binding.settled();
    expect(b.storedWords()).toEqual(['leaving', 'hidden']);
    visibility.mockRestore();
    binding.close();
  });

  it('saves what is due as it closes, and nothing afterwards', async () => {
    const b = browser();
    const binding = await b.tab({ saveDelayMs: 60_000 });
    write(binding.doc, 'closing');
    binding.close();
    await binding.settled();
    expect(b.storedWords()).toEqual(['closing']);
    write(binding.doc, 'after');
    window.dispatchEvent(new Event('pagehide'));
    await binding.settled();
    expect(b.save).toHaveBeenCalledTimes(1);
  });

  // "Browser tabs open on the same PDF pass each change to each other"
  it('passes each change to the browser’s other tabs on the same tab, and to no other', async () => {
    const b = browser();
    const one = await b.tab();
    const two = await b.tab();
    const elsewhere = await b.tab({ tabId: 't2' });
    write(one.doc, 'from tab one');
    expect(words(two.doc)).toEqual(['from tab one']);
    expect(words(elsewhere.doc)).toEqual([]);
    // What arrived from another browser tab is that tab's to save.
    await tick();
    await two.settled();
    expect(b.save).toHaveBeenCalledTimes(1);
    for (const end of b.ends) end.onmessage?.({ data: { documentId: 'D' } } as MessageEvent);
    for (const end of b.ends) end.onmessage?.({ data: null } as MessageEvent);
    one.close();
    two.close();
    elsewhere.close();
  });

  it('uses the kind’s own channel, and none where the browser has no BroadcastChannel', async () => {
    const made: string[] = [];
    class Channel {
      onmessage = null;
      constructor(name: string) {
        made.push(name);
      }
      postMessage() {}
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', Channel);
    const b = browser();
    // No channel handed: the browser's own.
    const own = { channel: undefined } as Partial<LiveTabLocalDeps>;
    const binding = await b.tab(own);
    write(binding.doc, 'said');
    binding.close();
    expect(made).toEqual(['livedoc-kind']);
    vi.stubGlobal('BroadcastChannel', undefined);
    const alone = await b.tab(own);
    write(alone.doc, 'alone');
    alone.close();
    await alone.settled();
    expect(b.storedWords()).toContain('alone');
  });

  it('never saves for a session that may not change the tab', async () => {
    const b = browser();
    const binding = await b.tab({ canEdit: false });
    write(binding.doc, 'not mine');
    binding.close();
    await binding.settled();
    expect(b.save).not.toHaveBeenCalled();
    expect(binding.saveFacts.get()).toEqual({ pending: false, failed: false });
  });

  it('rejects when the stored state cannot be read', async () => {
    const b = browser();
    await expect(
      b.tab({
        load: async () => {
          throw new Error('the record is gone');
        },
      }),
    ).rejects.toThrow('the record is gone');
  });
});

// docs/specs/035-pdf-documents/live-editing-and-storage.md "A page's last moment"
describe('a live tab kind’s last moment in This Browser', () => {
  it('writes a parting copy as the page leaves with a change unsaved, and removes it when the save lands', async () => {
    const b = browser();
    const { held, land } = heldSave();
    const binding = await b.tab({ saveDelayMs: 60_000 });
    b.save.mockImplementationOnce(async (update) => {
      await held;
      await b.save(update);
    });
    write(binding.doc, 'late');
    window.dispatchEvent(new Event('pagehide'));
    expect(partingCopies()).toHaveLength(1);
    land();
    await binding.settled();
    expect(partingCopies()).toEqual([]);
    expect(b.storedWords()).toEqual(['late']);
    binding.close();
  });

  // "One left behind joins the record when the PDF is next opened here"
  it('has the change the next time, when the page went before its save landed', async () => {
    const b = browser();
    const gone = await b.tab({ saveDelayMs: 60_000 });
    // The browser never finishes this save: the page is gone.
    b.save.mockImplementationOnce(() => new Promise<void>(() => {}));
    write(gone.doc, 'last word');
    window.dispatchEvent(new Event('pagehide'));
    gone.close();
    await tick();
    expect(b.storedWords()).toEqual([]);
    expect(partingCopies()).toHaveLength(1);

    const again = await b.tab();
    expect(words(again.doc)).toEqual(['last word']);
    expect(b.storedWords()).toEqual(['last word']);
    expect(partingCopies()).toEqual([]);
    again.close();
  });

  it('holds what a save still under way carries', async () => {
    const b = browser();
    const gone = await b.tab();
    b.save.mockImplementationOnce(() => new Promise<void>(() => {}));
    write(gone.doc, 'under way');
    await tick();
    expect(b.save).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pagehide'));
    gone.close();
    const again = await b.tab();
    expect(words(again.doc)).toEqual(['under way']);
    again.close();
  });

  it('writes one when the page is hidden and when the binding closes', async () => {
    const b = browser();
    const hidden = await b.tab({ saveDelayMs: 60_000 });
    b.save.mockImplementation(() => new Promise<void>(() => {}));
    write(hidden.doc, 'hidden');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockRestore();
    expect(partingCopies()).toHaveLength(1);
    const closing = await b.tab({ saveDelayMs: 60_000, tabId: 't2' });
    write(closing.doc, 'closing');
    closing.close();
    expect(partingCopies()).toHaveLength(2);
    hidden.close();
  });

  it('writes none when everything is saved', async () => {
    const b = browser();
    const binding = await b.tab();
    write(binding.doc, 'saved');
    await tick();
    await binding.settled();
    window.dispatchEvent(new Event('pagehide'));
    binding.close();
    expect(partingCopies()).toEqual([]);
  });

  it('keeps the copy while its save fails, until one lands', async () => {
    const b = browser();
    const binding = await b.tab({ saveDelayMs: 60_000, retryDelayMs: 5 });
    b.save.mockRejectedValueOnce(new Error('disk full'));
    write(binding.doc, 'kept');
    window.dispatchEvent(new Event('pagehide'));
    await binding.settled();
    expect(partingCopies()).toHaveLength(1);
    await tick();
    await tick();
    await binding.settled();
    expect(b.storedWords()).toEqual(['kept']);
    expect(partingCopies()).toEqual([]);
    binding.close();
  });

  it('keeps the copy while a later change is still due', async () => {
    const b = browser();
    const { held, land } = heldSave();
    const binding = await b.tab({ saveDelayMs: 60_000 });
    b.save.mockImplementationOnce(async (update) => {
      await held;
      await b.save(update);
    });
    write(binding.doc, 'first');
    window.dispatchEvent(new Event('pagehide'));
    write(binding.doc, 'second');
    land();
    await binding.settled();
    expect(partingCopies()).toHaveLength(1);
    binding.close();
    await binding.settled();
    expect(partingCopies()).toEqual([]);
    expect(b.storedWords()).toEqual(['first', 'second']);
  });

  it('opens on what is stored when a copy left behind cannot be saved, and keeps the copy', async () => {
    const b = browser();
    const gone = await b.tab({ saveDelayMs: 60_000 });
    b.save.mockImplementationOnce(() => new Promise<void>(() => {}));
    write(gone.doc, 'last word');
    gone.close();
    await tick();
    b.save.mockRejectedValueOnce(new Error('no store'));
    const again = await b.tab();
    expect(words(again.doc)).toEqual([]);
    expect(partingCopies()).toHaveLength(1);
    again.close();
  });

  it('never writes or joins one for a session that may not change the tab', async () => {
    const b = browser();
    const gone = await b.tab({ saveDelayMs: 60_000 });
    b.save.mockImplementationOnce(() => new Promise<void>(() => {}));
    write(gone.doc, 'last word');
    gone.close();
    await tick();
    b.save.mockClear();
    const reader = await b.tab({ canEdit: false });
    write(reader.doc, 'not mine');
    window.dispatchEvent(new Event('pagehide'));
    reader.close();
    expect(b.save).not.toHaveBeenCalled();
    expect(partingCopies()).toHaveLength(1);
  });

  it('works without the browser’s synchronous storage', async () => {
    const b = browser();
    const binding = await b.tab({ saveDelayMs: 60_000, partingStorage: null });
    write(binding.doc, 'kept');
    window.dispatchEvent(new Event('pagehide'));
    await binding.settled();
    expect(b.storedWords()).toEqual(['kept']);
    expect(partingCopies()).toEqual([]);
    binding.close();
  });
});

// docs/specs/034-text-documents/editing-surface.md "The title row": what the save status reads.
describe('a live tab kind’s save facts in This Browser', () => {
  it('are pending while a write is due, then settled once written', async () => {
    const b = browser();
    const binding = await b.tab({ saveDelayMs: 10 });
    write(binding.doc, 'here');
    expect(binding.saveFacts.get()).toEqual({ pending: true, failed: false });
    await tick();
    await tick();
    await tick();
    await binding.settled();
    expect(binding.saveFacts.get()).toEqual({ pending: false, failed: false });
    binding.close();
  });

  // "A failed save in This Browser is written again by itself"
  it('fail when a write fails, and the write is made again by itself after the retry delay', async () => {
    const b = browser();
    b.save.mockRejectedValueOnce(new Error('disk full'));
    const binding = await b.tab({ retryDelayMs: 5 });
    write(binding.doc, 'kept');
    await tick();
    await binding.settled();
    expect(binding.saveFacts.get()).toEqual({ pending: true, failed: true });
    await tick();
    await tick();
    await binding.settled();
    expect(b.save).toHaveBeenCalledTimes(2);
    expect(b.storedWords()).toEqual(['kept']);
    expect(binding.saveFacts.get()).toEqual({ pending: false, failed: false });
    binding.close();
  });

  it('waits the kind’s own retry delay when none is handed, and not past a close', async () => {
    const b = browser();
    b.save.mockRejectedValueOnce(new Error('disk full'));
    const binding = await b.tab();
    write(binding.doc, 'kept');
    await tick();
    await binding.settled();
    expect(b.save).toHaveBeenCalledTimes(1);
    // The close writes what failed; a failure after it arms nothing more.
    b.save.mockRejectedValueOnce(new Error('disk full'));
    binding.close();
    await binding.settled();
    await tick();
    expect(b.save).toHaveBeenCalledTimes(2);
  });
});
