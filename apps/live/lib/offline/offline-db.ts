// Opening Offline Mode's database (docs/specs/006-document/offline-mode.md "Tab records" and "Other
// browser tabs during an upgrade"): the version this build knows, the upgrade to it, and the other
// tabs of the browser sharing it. Every operation opens a connection, runs one transaction and closes
// it, so no tab holds the database between operations.

import { INDEXED_DB_PROBE_TIMEOUT_MS } from '@livedoc/ui';
import { reportApiWarning } from '../api/error-report';
import { debugLog } from '../debug-log';
import { noteOfflineStoreSuperseded } from '../server-release';
import { upgradeStores } from './legacy-offline-store';
import { DOCUMENTS_STORE } from './offline-tab-records';
import { migrateToTabRecords } from './offline-tab-records-migration';

export const OFFLINE_DB_NAME = 'livedoc-offline';

// Version 2 renamed the object store (./legacy-offline-store); version 3 keeps each tab in its own
// record (./offline-tab-records-migration).
export const OFFLINE_DB_VERSION = 3;

// How long opening the store may take (docs/specs/007-editor/load-recovery.md "The load always ends").
// Every document load asks the store first, so a browser whose IndexedDB never answers `open` used to
// hold the load on the opening screen forever. Shared with the browser checks' probe so the
// diagnostics report the same limit the load uses.
export const OFFLINE_STORE_OPEN_TIMEOUT_MS = INDEXED_DB_PROBE_TIMEOUT_MS;

// How long an upgrade the browser has started may take: it moves every offline document, so a large
// store needs longer than an open, and cutting it off would leave the page without its documents.
export const OFFLINE_STORE_UPGRADE_TIMEOUT_MS = 60_000;

// Thrown when the store did not open in time.
export class OfflineStoreUnavailableError extends Error {
  constructor(reason: 'timeout' | 'no-store') {
    super(`offline store ${reason}`);
    this.name = 'OfflineStoreUnavailableError';
  }
}

// Thrown when a newer build has upgraded the store past what this build can read: this tab is stale.
export class OfflineStoreSupersededError extends Error {
  constructor() {
    super('offline store upgraded by a newer build');
    this.name = 'OfflineStoreSupersededError';
  }
}

// The upgrade to this build's version failed and was rolled back; the reason is in the message.
class OfflineUpgradeFailedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'OfflineUpgradeFailedError';
  }
}

// Set once the upgrade failed on this page: the database is opened at the version it has from then on,
// and the next page load tries the upgrade again.
let upgradeFailed = false;
let superseded = false;

function noteSuperseded(how: 'VersionError' | 'versionchange'): void {
  if (superseded) return;
  superseded = true;
  console.warn('[offline-store] superseded', how);
  reportApiWarning('OfflineStore.Superseded');
  noteOfflineStoreSuperseded();
}

export async function openOfflineDb(): Promise<IDBDatabase> {
  if (upgradeFailed) return openAtCurrentVersion();
  try {
    return await openRequest(OFFLINE_DB_VERSION);
  } catch (err) {
    if (!(err instanceof OfflineUpgradeFailedError)) throw err;
    upgradeFailed = true;
    console.warn('[offline-store] migration-failed', err.message);
    reportApiWarning('OfflineStore.MigrationFailed');
    return openAtCurrentVersion();
  }
}

// After a failed upgrade: the database as it is, read and written in its own shape.
async function openAtCurrentVersion(): Promise<IDBDatabase> {
  const db = await openRequest(undefined);
  if (db.version > OFFLINE_DB_VERSION) {
    db.close();
    noteSuperseded('VersionError');
    throw new OfflineStoreSupersededError();
  }
  if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
    db.close();
    throw new OfflineStoreUnavailableError('no-store');
  }
  return db;
}

// One open. With a version, an upgrade runs the steps up to it; without one, the database opens as it is.
function openRequest(version: number | undefined): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    let settled = false;
    let upgrading = false;
    let migrationFailure: Error | null = null;
    const req =
      version === undefined
        ? indexedDB.open(OFFLINE_DB_NAME)
        : indexedDB.open(OFFLINE_DB_NAME, version);
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outcome();
    };
    const giveUp = () => settle(() => reject(new OfflineStoreUnavailableError('timeout')));
    let timer = setTimeout(giveUp, OFFLINE_STORE_OPEN_TIMEOUT_MS);
    req.onupgradeneeded = () => {
      if (version === undefined) return;
      upgrading = true;
      clearTimeout(timer);
      timer = setTimeout(giveUp, OFFLINE_STORE_UPGRADE_TIMEOUT_MS);
      const db = req.result;
      const tx = req.transaction!;
      // A request the browser fails (a full disk) aborts the upgrade; its error names why.
      tx.addEventListener('abort', () => {
        migrationFailure ??= tx.error;
      });
      upgradeStores(db, tx, DOCUMENTS_STORE, () =>
        migrateToTabRecords(
          db,
          tx,
          (outcome) => debugLog('[offline-store] moved to tab records', outcome),
          (err) => {
            migrationFailure = err;
          },
        ),
      );
    };
    // Another tab's connection holds the database: the upgrade waits for it to close, within the limit.
    req.onblocked = () => console.warn('[offline-store] upgrade-blocked');
    req.onsuccess = () => {
      const db = req.result;
      // An open that lands after we gave up is closed at once, so it never holds a version lock.
      if (settled) return db.close();
      // A newer build's upgrade is never held back by this tab.
      db.onversionchange = () => {
        db.close();
        noteSuperseded('versionchange');
      };
      settle(() => resolve(db));
    };
    req.onerror = () => {
      const err = req.error;
      settle(() => {
        if (err?.name === 'VersionError') {
          noteSuperseded('VersionError');
          reject(new OfflineStoreSupersededError());
        } else if (upgrading) {
          reject(
            new OfflineUpgradeFailedError(migrationFailure?.message ?? err?.message ?? 'aborted'),
          );
        } else {
          reject(err ?? new Error('IndexedDB open failed'));
        }
      });
    };
  });
}

// Test seam: forget what this page learnt about the database.
export function resetOfflineDbForTests(): void {
  upgradeFailed = false;
  superseded = false;
}
