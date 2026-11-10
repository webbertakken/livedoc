import type { Page } from '@playwright/test';
import { box, editLink, seedHomeDocument } from './home-seed';
import {
  test,
  expect,
  expectNoPageErrors,
  guestSigFor,
  mintSignedGuest,
  ownerHeaders,
} from './fixtures';

// Deleting a document's last tab deletes the document (docs/specs/006-document/document-structure.md "The last
// tab"), end to end against the real build and api worker: an empty last tab goes at once, one holding content asks
// first, a This Browser document takes the same path, and a share-link Editor cannot.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const EXPLORER = /\/explorer\//;

async function asOwner(page: Page, owner: string) {
  await page.addInitScript(
    ({ id, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', id);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
    },
    { id: owner, sig: guestSigFor(owner) },
  );
}

async function listedIds(page: Page, owner: string): Promise<string[]> {
  const list = await page.request.get(`${apiBase}/documents`, { headers: ownerHeaders(owner) });
  return ((await list.json()) as { documents: { id: string }[] }).documents.map((d) => d.id);
}

async function openTabMenuDelete(page: Page) {
  await page.getByRole('button', { name: 'Tab menu' }).click();
  return page.getByRole('button', { name: 'Delete', exact: true });
}

test('an empty last tab deletes its document at once', async ({ page, baseURL, pageErrors }) => {
  const owner = await mintSignedGuest(page.request);
  const doc = await seedHomeDocument(
    page.request,
    owner,
    new URL(baseURL!).origin,
    'Empty plan',
    [],
  );
  await asOwner(page, owner);
  await page.goto(`/document/${doc.id}`);

  const remove = await openTabMenuDelete(page);
  await expect(remove).toBeEnabled();
  await page.screenshot({
    path: test.info().outputPath('last-tab-enabled.png'),
    animations: 'disabled',
  });
  await remove.click();

  // Nothing is asked: the editor goes to the Explorer, which offers the Undo.
  await expect(page).toHaveURL(EXPLORER);
  await expect(page.getByText('“Empty plan” deleted')).toBeVisible();
  await expect.poll(() => listedIds(page, owner)).not.toContain(doc.id);
  expectNoPageErrors(pageErrors);
});

test('a last tab holding content asks first; Cancel keeps the document', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  const owner = await mintSignedGuest(page.request);
  const doc = await seedHomeDocument(page.request, owner, new URL(baseURL!).origin, 'Drawn plan', [
    box('a', 'Kickoff', 40, 40),
  ]);
  await asOwner(page, owner);
  await page.goto(`/document/${doc.id}`);

  await (await openTabMenuDelete(page)).click();
  const ask = page.getByRole('dialog', { name: 'Delete this document?' });
  await expect(ask).toContainText('This is its only tab, so the whole document goes to the Trash.');
  await page.screenshot({
    path: test.info().outputPath('last-tab-confirm.png'),
    animations: 'disabled',
  });

  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/document/${doc.id}`));
  expect(await listedIds(page, owner)).toContain(doc.id);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete this document?' })
    .getByRole('button', { name: 'Delete Document' })
    .click();
  await expect(page).toHaveURL(EXPLORER);
  await expect(page.getByText('“Drawn plan” deleted')).toBeVisible();
  await expect.poll(() => listedIds(page, owner)).not.toContain(doc.id);
  expectNoPageErrors(pageErrors);
});

test('a This Browser document goes to the local Trash the same way', async ({
  page,
  pageErrors,
}) => {
  const owner = await mintSignedGuest(page.request);
  await asOwner(page, owner);
  await page.goto('/explorer/home');
  // A document kept only in this browser, written as the editor writes it, one empty tab.
  const id = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const docId = crypto.randomUUID();
        const open = indexedDB.open('livedoc-offline', 2);
        open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
        // The store, as the app makes it on first use (offline-backend.ts), when this browser has none yet.
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains('documents')) {
            open.result.createObjectStore('documents', { keyPath: 'id' });
          }
        };
        open.onsuccess = () => {
          let tx: IDBTransaction;
          try {
            tx = open.result.transaction('documents', 'readwrite');
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          const now = Date.now();
          tx.objectStore('documents').put({
            id: docId,
            name: 'Kept here',
            folderId: null,
            createdAt: now,
            savedAt: now,
            tabs: [{ id: 't1', name: 'Tab 1', elements: [] }],
          });
          tx.oncomplete = () => resolve(docId);
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        };
      }),
  );
  await page.goto(`/document/${id}`);
  await expect(page.getByRole('button', { name: 'This Browser' })).toBeVisible();

  await (await openTabMenuDelete(page)).click();
  await expect(page).toHaveURL(EXPLORER);
  // Moved to this browser's Trash: the stored row carries its delete time.
  await expect
    .poll(() =>
      page.evaluate(
        (docId) =>
          new Promise<unknown>((resolve, reject) => {
            const open = indexedDB.open('livedoc-offline');
            open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
            open.onsuccess = () => {
              const get = open.result.transaction('documents').objectStore('documents').get(docId);
              get.onsuccess = () =>
                resolve((get.result as { trashedAt?: number } | undefined)?.trashedAt);
              get.onerror = () => reject(get.error ?? new Error('IndexedDB read failed'));
            };
          }),
        id,
      ),
    )
    .toEqual(expect.any(Number));
  expectNoPageErrors(pageErrors);
});

test('a share-link Editor cannot delete the document through its last tab', async ({
  browser,
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const owner = await mintSignedGuest(page.request);
  const doc = await seedHomeDocument(page.request, owner, origin, 'Shared plan', []);
  const code = await editLink(page.request, owner, origin, doc.id);

  const context = await browser.newContext({ colorScheme: 'dark' });
  const visitor = await context.newPage();
  await asOwner(visitor, await mintSignedGuest(visitor.request));
  await visitor.goto(`/document/shared?s=${code}`);
  const remove = await openTabMenuDelete(visitor);
  await expect(remove).toBeDisabled();
  await visitor.screenshot({
    path: test.info().outputPath('last-tab-editor.png'),
    animations: 'disabled',
  });
  expect(await listedIds(page, owner)).toContain(doc.id);
  await context.close();
});
