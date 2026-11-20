import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { seedOfflineDocuments } from '../offline-seed';

// A text document in This Browser (docs/specs/034-text-documents/live-editing-and-storage.md "A text document in This
// Browser"): no room; its writing is saved in this browser, back after a reload, and downloads as its file.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';

// How many text document states the document's offline record holds.
function savedStates(id: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('livedoc-offline');
    open.onsuccess = () => {
      const read = open.result.transaction('documents').objectStore('documents').get(id);
      read.onsuccess = () => {
        open.result.close();
        resolve(
          (read.result as { textDocuments?: unknown[] } | undefined)?.textDocuments?.length ?? 0,
        );
      };
      read.onerror = () => reject(read.error ?? new Error('read failed'));
    };
    open.onerror = () => reject(open.error ?? new Error('open failed'));
  });
}

test('a text document in This Browser keeps its writing across a reload and downloads it', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer');
  const id = crypto.randomUUID();
  await seedOfflineDocuments(page, [
    {
      id,
      name: 'Kept here',
      folderId: null,
      createdAt: 1,
      savedAt: 1,
      tabs: [{ id: 't1', name: 'Kept here', kind: 'text-document', format: 'odf', elements: [] }],
    },
  ]);
  await page.goto(`/document/${id}`);
  await expect(page.locator(READY)).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('Written with no server.');
  // Saved in this browser a moment after the typing stops.
  await expect.poll(() => page.evaluate(savedStates, id)).toBe(1);

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.locator(BODY)).toHaveText('Written with no server.');

  const downloadItem = await officeMenuItem(page, [
    'File',
    'Download',
    'OpenDocument format (.odt)',
  ]);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  expect(download.suggestedFilename()).toBe('Kept here.odt');
  expectNoPageErrors(pageErrors);
});
