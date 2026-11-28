// @vitest-environment jsdom
// docs/specs/035-pdf-documents/live-editing-and-storage.md "A page's last moment": what a page has not saved when it
// goes is written at once to the browser's synchronous storage, removed when its save lands, and joins the record
// the next time the record is read.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { base64OfBytes } from '@livedoc/office-packages';
import { LIVE_TAB_PARTING_MAX_CHARS, joinPartingCopies, partingCopy } from './live-tab-parting';
import {
  LIVE_TAB_PARTING_PREFIX,
  forgetPartingCopies,
  hasPartingCopies,
  partingStorage,
} from './live-tab-parting-keys';

const PLACE = { documentId: 'D', tabId: 't1', tag: '[kind]' };

const updateOf = (word: string) => {
  const doc = new Y.Doc();
  doc.getArray<string>('words').push([word]);
  return Y.encodeStateAsUpdate(doc);
};
const wordsOf = (updates: readonly Uint8Array[]) => {
  const doc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(doc, update);
  return doc.getArray<string>('words').toArray().toSorted();
};
const keys = () =>
  Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).toSorted();

beforeEach(() => {
  localStorage.clear();
});

describe("a live tab's parting copy", () => {
  it('is written under the document, the tab and the browser tab that wrote it', () => {
    const update = updateOf('late');
    partingCopy(localStorage, PLACE, 'w1').write(update);
    expect(keys()).toEqual([`${LIVE_TAB_PARTING_PREFIX}D:t1:w1`]);
    expect(localStorage.getItem(keys()[0]!)).toBe(base64OfBytes(update));
  });

  it('is one a browser tab: a later write replaces the earlier, another browser tab writes its own', () => {
    const first = partingCopy(localStorage, PLACE, 'w1');
    first.write(updateOf('one'));
    first.write(updateOf('two'));
    partingCopy(localStorage, PLACE, 'w2').write(updateOf('three'));
    expect(keys()).toEqual([
      `${LIVE_TAB_PARTING_PREFIX}D:t1:w1`,
      `${LIVE_TAB_PARTING_PREFIX}D:t1:w2`,
    ]);
  });

  it('names its browser tab by itself', () => {
    partingCopy(localStorage, PLACE).write(updateOf('one'));
    partingCopy(localStorage, PLACE).write(updateOf('two'));
    expect(keys()).toHaveLength(2);
  });

  it('is removed when its save lands, leaving another browser tab its own', () => {
    const mine = partingCopy(localStorage, PLACE, 'w1');
    mine.write(updateOf('one'));
    partingCopy(localStorage, PLACE, 'w2').write(updateOf('two'));
    mine.remove();
    expect(keys()).toEqual([`${LIVE_TAB_PARTING_PREFIX}D:t1:w2`]);
  });

  // "Past LIVE_TAB_PARTING_MAX_CHARS ... none is written"
  it('is not written past the limit, and what was written before stays', () => {
    const copy = partingCopy(localStorage, PLACE, 'w1', 40);
    copy.write(updateOf('a'));
    const before = localStorage.getItem(keys()[0]!);
    copy.write(updateOf('a word far longer than forty characters of base64 would hold'));
    expect(localStorage.getItem(keys()[0]!)).toBe(before);
  });

  it('takes a fifth of what a browser gives localStorage', () => {
    expect(LIVE_TAB_PARTING_MAX_CHARS).toBe(1_000_000);
  });

  // "or where the browser refuses it, none is written"
  it('is not written where the browser refuses it, without throwing', () => {
    const full = {
      ...fakeStorage(),
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    expect(() => partingCopy(full, PLACE, 'w1').write(updateOf('one'))).not.toThrow();
    expect(full.length).toBe(0);
  });

  it('does nothing in a browser without storage', async () => {
    const copy = partingCopy(null, PLACE, 'w1');
    expect(() => {
      copy.write(updateOf('one'));
      copy.remove();
    }).not.toThrow();
    const save = vi.fn(async () => {});
    expect(await joinPartingCopies(null, PLACE, save)).toBe(0);
    expect(save).not.toHaveBeenCalled();
    expect(hasPartingCopies(null, 'D')).toBe(false);
    expect(forgetPartingCopies(null, 'D')).toBe(0);
  });
});

/** A storage of its own, so a test can make one refuse. */
function fakeStorage() {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    key: (index: number) => [...held.keys()][index] ?? null,
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
    removeItem: (key: string) => void held.delete(key),
  };
}

describe('parting copies left behind', () => {
  // "One left behind joins the record when the PDF is next opened here"
  it('each join the record through its save and are removed once saved', async () => {
    partingCopy(localStorage, PLACE, 'w1').write(updateOf('one'));
    partingCopy(localStorage, PLACE, 'w2').write(updateOf('two'));
    const saved: Uint8Array[] = [];
    const joined = await joinPartingCopies(localStorage, PLACE, async (update) => {
      saved.push(update);
    });
    expect(joined).toBe(2);
    expect(wordsOf(saved)).toEqual(['one', 'two']);
    expect(keys()).toEqual([]);
  });

  it("leave another tab's and another document's alone", async () => {
    partingCopy(localStorage, PLACE, 'w1').write(updateOf('mine'));
    partingCopy(localStorage, { ...PLACE, tabId: 't2' }, 'w1').write(updateOf('other tab'));
    partingCopy(localStorage, { ...PLACE, documentId: 'E' }, 'w1').write(updateOf('other'));
    const save = vi.fn(async () => {});
    expect(await joinPartingCopies(localStorage, PLACE, save)).toBe(1);
    expect(keys()).toEqual([
      `${LIVE_TAB_PARTING_PREFIX}D:t2:w1`,
      `${LIVE_TAB_PARTING_PREFIX}E:t1:w1`,
    ]);
  });

  it('stay when their save fails, for the next time', async () => {
    partingCopy(localStorage, PLACE, 'w1').write(updateOf('one'));
    const joined = await joinPartingCopies(localStorage, PLACE, () =>
      Promise.reject(new Error('no store')),
    );
    expect(joined).toBe(0);
    expect(keys()).toHaveLength(1);
  });

  // "One that cannot be read is removed and logged, never merged."
  it.each([
    ['is no base64', 'not base64 at all!'],
    ['is no update', base64OfBytes(new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]))],
    ['is empty', ''],
  ])('are removed, never saved, when one %s', async (_what, text) => {
    localStorage.setItem(`${LIVE_TAB_PARTING_PREFIX}D:t1:w1`, text);
    const save = vi.fn(async () => {});
    expect(await joinPartingCopies(localStorage, PLACE, save)).toBe(0);
    expect(save).not.toHaveBeenCalled();
    expect(keys()).toEqual([]);
  });

  it('are found by their document, whatever the tab', () => {
    expect(hasPartingCopies(localStorage, 'D')).toBe(false);
    partingCopy(localStorage, { ...PLACE, tabId: 't2' }, 'w1').write(updateOf('one'));
    expect(hasPartingCopies(localStorage, 'D')).toBe(true);
    expect(hasPartingCopies(localStorage, 'E')).toBe(false);
  });

  // "it goes with a record that is deleted"
  it('go with their document', () => {
    partingCopy(localStorage, PLACE, 'w1').write(updateOf('one'));
    partingCopy(localStorage, { ...PLACE, tabId: 't2' }, 'w2').write(updateOf('two'));
    partingCopy(localStorage, { ...PLACE, documentId: 'DD' }, 'w1').write(updateOf('other'));
    localStorage.setItem('livedoc:v2:self-id', 'me');
    expect(forgetPartingCopies(localStorage, 'D')).toBe(2);
    expect(keys()).toEqual([`${LIVE_TAB_PARTING_PREFIX}DD:t1:w1`, 'livedoc:v2:self-id']);
  });
});

describe("the browser's synchronous storage", () => {
  it('is localStorage', () => {
    expect(partingStorage()).toBe(localStorage);
  });

  it('is none where a browser keeps it from the page', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(partingStorage()).toBeNull();
    vi.restoreAllMocks();
  });

  it('is none where there is no page', () => {
    vi.stubGlobal('window', undefined);
    expect(partingStorage()).toBeNull();
    vi.unstubAllGlobals();
  });
});
