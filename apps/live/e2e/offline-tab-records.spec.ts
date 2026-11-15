import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { box } from './home-seed';
import {
  test,
  expect,
  expectNoPageErrors,
  guestSigFor,
  mintSignedGuest,
  switchToTab,
} from './fixtures';

// An offline document's tabs, one record each (docs/specs/006-document/offline-mode.md "Tab records
// (version 3)" and "Other browser tabs during an upgrade"), end to end in a real browser: a document
// saved by the build before (one record holding every tab) opens intact after the upgrade, an older
// tab holding the database only delays it, and a tab a newer build has overtaken asks to reload.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

const TAB_NAMES = ['Context', 'Events', 'Commands', 'Policies', 'Read models'];

// A five-tab document as the build before version 3 stored it: one record, every tab inline.
function wholeRecord(id: string) {
  const now = Date.now();
  return {
    id,
    name: 'Saved before the upgrade',
    folderId: null,
    createdAt: now,
    savedAt: now,
    tabs: TAB_NAMES.map((name, t) => ({
      id: `t${t}`,
      name,
      kind: 'diagram',
      elements: [
        box(`t${t}-a`, `${name} first`, 40, 40),
        box(`t${t}-b`, `${name} second`, 320, 160),
      ],
    })),
  };
}

async function asOwner(page: Page, owner: string) {
  await page.addInitScript(
    ({ ownerId, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', ownerId);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
    },
    { ownerId: owner, sig: guestSigFor(owner) },
  );
}

// Seeds the old layout from a static file on the same origin, before the app opens the store. With
// `hold`, the connection stays open as an older tab mid-transaction would, closing `hold` ms after a
// newer build asks.
async function seedVersionTwo(page: Page, record: ReturnType<typeof wholeRecord>, hold?: number) {
  await page.goto('/icon.svg');
  await page.evaluate(
    ({ rec, holdMs }) =>
      new Promise<void>((resolve, reject) => {
        const del = indexedDB.deleteDatabase('livedoc-offline');
        del.onsuccess = () => {
          const req = indexedDB.open('livedoc-offline', 2);
          req.onupgradeneeded = () => req.result.createObjectStore('documents', { keyPath: 'id' });
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('documents', 'readwrite');
            tx.objectStore('documents').put(rec);
            tx.oncomplete = () => {
              if (holdMs === undefined) db.close();
              else db.onversionchange = () => setTimeout(() => db.close(), holdMs);
              resolve();
            };
            tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
          };
          req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
        };
      }),
    { rec: record, holdMs: hold },
  );
}

// The store as it now is: its version, each document record and the tab record keys.
function readStore(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ version: number; documents: unknown[]; tabKeys: unknown[] }>(
        (resolve, reject) => {
          const req = indexedDB.open('livedoc-offline');
          req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['documents', 'tabs']);
            const documents = tx.objectStore('documents').getAll();
            const tabKeys = tx.objectStore('tabs').getAllKeys();
            tx.oncomplete = () => {
              resolve({
                version: db.version,
                documents: documents.result,
                tabKeys: tabKeys.result,
              });
              db.close();
            };
          };
        },
      ),
  );
}

async function expectEveryTabIntact(page: Page) {
  for (const name of TAB_NAMES) {
    await switchToTab(page, name);
    await expect(page.getByText(`${name} first`).first()).toBeVisible();
    await expect(page.getByText(`${name} second`).first()).toBeVisible();
  }
}

test('a document saved before the upgrade opens intact, its tabs now one record each', async ({
  page,
  pageErrors,
}) => {
  await asOwner(page, await mintSignedGuest(page.request));
  const id = randomUUID();
  await seedVersionTwo(page, wholeRecord(id));

  await page.goto(`/document/${id}`);
  await expect(page.getByRole('button', { name: 'This Browser' })).toBeVisible();
  await expectEveryTabIntact(page);

  const store = await readStore(page);
  expect(store.version).toBe(3);
  expect(store.documents).toEqual([
    expect.objectContaining({ id, tabIds: ['t0', 't1', 't2', 't3', 't4'] }),
  ]);
  expect(store.documents[0]).not.toHaveProperty('tabs');
  expect(store.tabKeys).toEqual(TAB_NAMES.map((_, t) => [id, `t${t}`]));

  // And again from the new layout alone.
  await page.reload();
  await expectEveryTabIntact(page);
  expectNoPageErrors(pageErrors);
});

test('an older tab holding the store delays the upgrade, never loses the document', async ({
  context,
  page,
  pageErrors,
}) => {
  await asOwner(page, await mintSignedGuest(page.request));
  const id = randomUUID();
  const older = await context.newPage();
  await seedVersionTwo(older, wholeRecord(id), 1_000);

  await page.goto(`/document/${id}`);
  await expectEveryTabIntact(page);
  expect((await readStore(page)).version).toBe(3);
  expectNoPageErrors(pageErrors);
});

test('a tab a newer build has overtaken asks to reload', async ({ context, page, pageErrors }) => {
  await asOwner(page, await mintSignedGuest(page.request));
  const id = randomUUID();
  await seedVersionTwo(page, wholeRecord(id));
  await page.goto(`/document/${id}`);
  await expect(page.getByText('Context first').first()).toBeVisible();

  // Another tab runs a build that upgrades the store past this one.
  const newer = await context.newPage();
  await newer.goto('/icon.svg');
  await newer.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('livedoc-offline', 4);
        req.onsuccess = () => {
          req.result.close();
          resolve();
        };
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      }),
  );

  // This tab's next write finds the store overtaken.
  await page.locator('[data-doc-name] button').click();
  await page.locator('[data-doc-name] input').fill('Renamed after the upgrade');
  await page.locator('[data-doc-name] input').press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'A new version of LiveDoc is ready.' }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('offline-store-overtaken.png'),
    animations: 'disabled',
  });
  // The rename stays on screen, unsaved, rather than vanishing.
  await expect(page.locator('[data-doc-name] button')).toHaveText('Renamed after the upgrade');
  expectNoPageErrors(pageErrors);
});
