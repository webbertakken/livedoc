import { readFileSync } from 'node:fs';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, pageOneDrawn, sha256 } from './pdf-document-pages';

// files-print-and-sync.md "Downloading": File > Download > PDF of a PDF nobody changed is its stored file itself,
// byte for byte, named as the document is (saving.md "An unchanged file").

test('downloading a PDF nobody changed hands back the very file that arrived', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  const arrived = await textPdf(3);
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Quarterly figures.pdf', arrived);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);

  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  expect(download.suggestedFilename()).toBe('Quarterly figures.pdf');
  const handed = readFileSync(await download.path());
  expect(handed.byteLength).toBe(arrived.byteLength);
  expect(sha256(handed)).toBe(sha256(arrived));
  expectNoPageErrors(pageErrors);
});
