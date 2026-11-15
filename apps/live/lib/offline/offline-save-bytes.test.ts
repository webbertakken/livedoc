// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Tab } from '@livedoc/document';
import { __setOfflineBackend, offlineCreateDocument, offlineSaveTab } from './offline-store';

// docs/specs/016-platform/web-performance.md "Realtime and saving": an autosave of a This Browser
// document writes the tab it saves, never the whole document. Counted as the JSON size of every value
// the store puts, on a five-tab document of 1,000 boxes a tab.

const TABS = 5;
const BOXES = 1000;

const box = (id: string): Element => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  label: id,
});

const tab = (t: number): Tab => ({
  id: `t${t}`,
  name: `Tab ${t}`,
  elements: Array.from({ length: BOXES }, (_, i) => box(`t${t}-e${i}`)),
});

let written = 0;
const realPut = IDBObjectStore.prototype.put;

beforeEach(
  () =>
    new Promise<void>((resolve) => {
      __setOfflineBackend(null);
      const req = indexedDB.deleteDatabase('livedoc-offline');
      req.onsuccess = () => resolve();
    }),
);

afterEach(() => {
  IDBObjectStore.prototype.put = realPut;
});

function countWrites(): void {
  written = 0;
  IDBObjectStore.prototype.put = function put(
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    written += JSON.stringify(value).length;
    return realPut.call(this, value, key);
  };
}

describe('an offline autosave', () => {
  it('writes one tab and the document meta, not every tab', async () => {
    const tabs = Array.from({ length: TABS }, (_, t) => tab(t));
    await offlineCreateDocument({ id: 'doc', name: 'Big', tabs }, 1);
    const oneTab = JSON.stringify(stampedTab(tabs[2]!)).length;

    countWrites();
    const edited = { ...tabs[2]!, elements: [...tabs[2]!.elements, box('new')] };
    await offlineSaveTab('doc', edited, 2);

    console.info(`[offline-save-bytes] one tab ${oneTab} bytes, autosave wrote ${written} bytes`);
    expect(written).toBeLessThan(oneTab * 1.1);
  });
});

function stampedTab(t: Tab): Tab {
  return { ...t, kind: 'diagram' };
}
