// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setOfflineBackend,
  isOfflineId,
  offlineGetRecord,
  offlineSaveTab,
  type OfflineDocumentRecord,
} from './offline-store';
import { openOfflineDb } from './offline-db';
import {
  newVersionAvailable,
  resetServerReleaseForTests,
  runningStaleBuild,
} from '../server-release';
import { setApiWarningReporter } from '../api/error-report';

// docs/specs/006-document/offline-mode.md "Other browser tabs during an upgrade": the tabs of one
// browser share the database, and one may run an older or a newer build than another.

const DB = 'livedoc-offline';

const rec: OfflineDocumentRecord = {
  id: 'doc',
  name: 'Doc',
  folderId: null,
  createdAt: 1,
  savedAt: 2,
  tabs: [{ id: 't1', name: 'Tab', kind: 'diagram', elements: [] }],
};

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

// Another tab's connection, at `version`, made as that build would.
function otherTab(version: number, setUp?: (db: IDBDatabase, tx: IDBTransaction) => void) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, version);
    req.onupgradeneeded = () => setUp?.(req.result, req.transaction!);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

const warnings: unknown[][] = [];
const reported: string[] = [];

beforeEach(async () => {
  __setOfflineBackend(null);
  resetServerReleaseForTests();
  warnings.length = 0;
  reported.length = 0;
  setApiWarningReporter((t) => reported.push(t));
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void warnings.push(args));
  await request(indexedDB.deleteDatabase(DB) as unknown as IDBRequest<undefined>);
});

afterEach(() => {
  vi.restoreAllMocks();
  setApiWarningReporter(null);
  resetServerReleaseForTests();
  __setOfflineBackend(null);
});

describe('an older tab holding the database', () => {
  it('blocks the upgrade only until it closes, and the upgrade then reads everything', async () => {
    const older = await otherTab(2, (db, tx) => {
      db.createObjectStore('documents', { keyPath: 'id' });
      tx.objectStore('documents').put(rec);
    });
    // The build before version 3 has no versionchange handler: it closes when its transaction ends.
    older.onversionchange = () => setTimeout(() => older.close(), 50);

    expect(await offlineGetRecord('doc')).toEqual(rec);
    expect(warnings).toContainEqual(['[offline-store] upgrade-blocked']);
    expect(reported).toEqual([]);
  });
});

describe('a newer build upgrading the database', () => {
  it('is never blocked by this tab: its connection closes and the page learns it is stale', async () => {
    const mine = await openOfflineDb();
    const newer = await otherTab(4);
    newer.close();
    expect(() => mine.transaction('documents')).toThrow();
    expect(warnings).toContainEqual(['[offline-store] superseded', 'versionchange']);
    expect(reported).toEqual(['OfflineStore.Superseded']);
    expect(newVersionAvailable()).toBe(true);
    expect(runningStaleBuild()).toBe(true);
  });

  it('refuses this tab afterwards: saves fail out loud and the page asks to reload', async () => {
    (await openOfflineDb()).close();
    (await otherTab(4)).close();

    await expect(offlineSaveTab('doc', rec.tabs[0]!, 3)).rejects.toMatchObject({
      name: 'OfflineStoreSupersededError',
    });
    expect(newVersionAvailable()).toBe(true);
    // The id check answers at once rather than waiting on a store it cannot open.
    expect(await isOfflineId('doc')).toBe(false);
    expect(reported).toEqual(['OfflineStore.Superseded']);
  });
});
