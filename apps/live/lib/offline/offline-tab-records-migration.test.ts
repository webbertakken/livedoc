// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Element, Tab } from '@livedoc/document';
import {
  __setOfflineBackend,
  offlineGetRecord,
  offlineListDocuments,
  offlineSaveTab,
  offlineSetFavourite,
  type OfflineDocumentRecord,
} from './offline-store';
import { migrateToTabRecords, sameTab } from './offline-tab-records-migration';
import { metaOf } from './offline-tab-records';

// docs/specs/006-document/offline-mode.md "Tab records (version 3)".

const DB = 'livedoc-offline';

const box = (id: string): Element => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 1,
  y: 2,
  width: 10,
  height: 10,
  label: `Label ${id}`,
});

const tab = (id: string, boxes = 3): Tab => ({
  id,
  name: `Tab ${id}`,
  kind: 'diagram',
  elements: Array.from({ length: boxes }, (_, i) => box(`${id}-e${i}`)),
});

const record = (
  id: string,
  tabs: Tab[] = [tab('t1'), tab('t2'), tab('t3')],
): OfflineDocumentRecord => ({
  id,
  name: `Doc ${id}`,
  folderId: null,
  createdAt: 1,
  savedAt: 2,
  tabs,
  favourite: true,
  tagIds: ['tag-1'],
  items: [],
  presentation: '{"slides":[]}',
});

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

// A database at `version`, its stores made by `setUp`, filled by `fill` in the same upgrade.
function seed(
  version: number,
  setUp: (db: IDBDatabase) => void,
  fill: (tx: IDBTransaction) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, version);
    req.onupgradeneeded = () => {
      setUp(req.result);
      fill(req.transaction!);
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

// What version 2 (the build before tab records) left: whole records in `documents`.
const seedVersionTwo = (recs: OfflineDocumentRecord[]) =>
  seed(
    2,
    (db) => db.createObjectStore('documents', { keyPath: 'id' }),
    (tx) => recs.forEach((r) => tx.objectStore('documents').put(r)),
  );

// Read the raw stores as they are, at whatever version the database has.
async function raw(): Promise<{
  version: number;
  stores: string[];
  documents: Record<string, unknown>[];
  tabKeys: IDBValidKey[];
}> {
  const db = await request(indexedDB.open(DB));
  const stores = [...db.objectStoreNames];
  const tx = db.transaction(stores, 'readonly');
  const documents = (await request(tx.objectStore('documents').getAll())) as Record<
    string,
    unknown
  >[];
  const tabKeys = stores.includes('tabs') ? await request(tx.objectStore('tabs').getAllKeys()) : [];
  const version = db.version;
  db.close();
  return { version, stores, documents, tabKeys };
}

const warnings: unknown[][] = [];

beforeEach(async () => {
  __setOfflineBackend(null);
  warnings.length = 0;
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void warnings.push(args));
  await request(indexedDB.deleteDatabase(DB) as unknown as IDBRequest<undefined>);
});

afterEach(() => {
  vi.restoreAllMocks();
  __setOfflineBackend(null);
});

describe('the version 3 upgrade', () => {
  it('moves every document to tab records without losing a field', async () => {
    const a = record('a');
    const b = record('b', [tab('only', 50)]);
    await seedVersionTwo([a, b]);

    expect(await offlineGetRecord('a')).toEqual(a);
    expect(await offlineGetRecord('b')).toEqual(b);

    const after = await raw();
    expect(after.version).toBe(3);
    expect(after.stores).toEqual(['documents', 'tabs']);
    expect(after.documents).toEqual([metaOf(a), metaOf(b)]);
    expect(after.tabKeys).toEqual([
      ['a', 't1'],
      ['a', 't2'],
      ['a', 't3'],
      ['b', 'only'],
    ]);
  });

  it('keeps the tab order, which is not the order of the tab ids', async () => {
    const rec = record('a', [tab('z'), tab('a'), tab('m')]);
    await seedVersionTwo([rec]);
    expect((await offlineGetRecord('a'))!.tabs.map((t) => t.id)).toEqual(['z', 'a', 'm']);
  });

  it('moves a document with no tabs', async () => {
    const rec = record('empty', []);
    await seedVersionTwo([rec]);
    expect(await offlineGetRecord('empty')).toEqual(rec);
  });

  it('upgrades a browser still on version 1 in one step', async () => {
    const rec = record('old');
    await seed(
      1,
      (db) => db.createObjectStore('diagrams', { keyPath: 'id' }),
      (tx) => tx.objectStore('diagrams').put(rec),
    );
    expect(await offlineGetRecord('old')).toEqual(rec);
    expect((await raw()).stores).toEqual(['documents', 'tabs']);
  });

  it('keeps whole a document whose tabs share an id, and reads it intact', async () => {
    const twins = record('twins', [tab('same'), { ...tab('same'), name: 'Other' }]);
    await seedVersionTwo([twins, record('fine')]);
    expect(await offlineGetRecord('twins')).toEqual(twins);
    const after = await raw();
    expect(after.documents.find((d) => d.id === 'twins')).toEqual(twins);
    expect(after.tabKeys).not.toContainEqual(['twins', 'same']);
    expect(warnings.some(([m]) => m === '[offline-store] migration-kept-whole')).toBe(true);
  });
});

describe('a failed upgrade', () => {
  it('rolls back to version 2, keeps every document readable, and logs why', async () => {
    const rec = record('a');
    await seedVersionTwo([rec]);
    const realPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function put(
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'tabs') throw new DOMException('disk full', 'QuotaExceededError');
      return realPut.call(this, value, key);
    });

    expect(await offlineGetRecord('a')).toEqual(rec);
    expect(warnings).toContainEqual([
      '[offline-store] migration-failed',
      'offline store migration failed: QuotaExceededError: disk full',
    ]);
    const after = await raw();
    expect(after.version).toBe(2);
    expect(after.documents).toEqual([rec]);
  });

  it('writes in the old shape for the rest of the page, then upgrades on the next load', async () => {
    await seedVersionTwo([record('a')]);
    const realPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function put(
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'tabs') throw new DOMException('disk full', 'QuotaExceededError');
      return realPut.call(this, value, key);
    });
    await offlineSaveTab('a', { ...tab('t2'), name: 'Edited' }, 9);
    await offlineSetFavourite('a', false);
    const whole = (await raw()).documents[0] as unknown as OfflineDocumentRecord;
    expect(whole.tabs.map((t) => t.name)).toEqual(['Tab t1', 'Edited', 'Tab t3']);
    expect(whole.favourite).toBe(false);

    spy.mockRestore();
    __setOfflineBackend(null); // the next page load
    const rec = (await offlineGetRecord('a'))!;
    expect(rec.tabs.map((t) => t.name)).toEqual(['Tab t1', 'Edited', 'Tab t3']);
    expect(rec.savedAt).toBe(9);
    expect((await raw()).version).toBe(3);
  });

  it('aborts when a tab does not read back the same', () => {
    expect(sameTab(tab('t1'), tab('t1'))).toBe(true);
    expect(sameTab(tab('t1'), undefined)).toBe(false);
    expect(sameTab(tab('t1'), { ...tab('t1'), elements: [] })).toBe(false);
  });
});

describe('a half-done store', () => {
  // Version 3 holding both shapes: a document in tab records, one still whole with a stray tab
  // record, and a tab record of a document that is gone.
  async function seedMixed(): Promise<{
    split: OfflineDocumentRecord;
    whole: OfflineDocumentRecord;
  }> {
    const split = record('split');
    const whole = record('whole');
    await seed(
      3,
      (db) => {
        db.createObjectStore('documents', { keyPath: 'id' });
        db.createObjectStore('tabs');
      },
      (tx) => {
        tx.objectStore('documents').put(metaOf(split));
        for (const t of split.tabs) tx.objectStore('tabs').put(t, ['split', t.id]);
        tx.objectStore('documents').put(whole);
        tx.objectStore('tabs').put(tab('stray'), ['whole', 'stray']);
        tx.objectStore('tabs').put(tab('orphan'), ['gone', 'orphan']);
      },
    );
    return { split, whole };
  }

  it('reads both shapes intact and lists every document once', async () => {
    const { split, whole } = await seedMixed();
    expect(await offlineGetRecord('split')).toEqual(split);
    expect(await offlineGetRecord('whole')).toEqual(whole);
    expect((await offlineListDocuments()).map((d) => d.id).sort()).toEqual(['split', 'whole']);
  });

  it('stores a whole document as tab records on its next write, dropping strays', async () => {
    await seedMixed();
    await offlineSaveTab('whole', { ...tab('t1'), name: 'Edited' }, 9);
    const after = await raw();
    expect(after.documents.find((d) => d.id === 'whole')).toMatchObject({
      tabIds: ['t1', 't2', 't3'],
    });
    expect(after.documents.find((d) => d.id === 'whole')).not.toHaveProperty('tabs');
    expect(after.tabKeys).not.toContainEqual(['whole', 'stray']);
    expect((await offlineGetRecord('whole'))!.tabs.map((t) => t.name)).toEqual([
      'Edited',
      'Tab t2',
      'Tab t3',
    ]);
  });

  it('is idempotent: running the migration again changes nothing', async () => {
    const { split, whole } = await seedMixed();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB, 4);
      req.onupgradeneeded = () =>
        migrateToTabRecords(req.result, req.transaction!, () => undefined, reject);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
    });
    const once = await raw();
    expect(once.documents).toEqual([metaOf(split), metaOf(whole)]);

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB, 5);
      req.onupgradeneeded = () =>
        migrateToTabRecords(req.result, req.transaction!, () => undefined, reject);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
    });
    const twice = await raw();
    expect(twice.documents).toEqual(once.documents);
    expect(twice.tabKeys).toEqual(once.tabKeys);
  });

  it('leaves out a listed tab whose record is missing, and says so', async () => {
    const rec = record('a');
    await seed(
      3,
      (db) => {
        db.createObjectStore('documents', { keyPath: 'id' });
        db.createObjectStore('tabs');
      },
      (tx) => {
        tx.objectStore('documents').put(metaOf(rec));
        tx.objectStore('tabs').put(rec.tabs[0], ['a', 't1']);
      },
    );
    expect((await offlineGetRecord('a'))!.tabs.map((t) => t.id)).toEqual(['t1']);
    expect(warnings.filter(([m]) => m === '[offline-store] tab-record-missing')).toHaveLength(2);
  });
});
