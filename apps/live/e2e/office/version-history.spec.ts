import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { seedOfflineDocuments } from '../offline-seed';

// File > Version history > See version history (docs/specs/034-text-documents/review.md "Version history";
// review-surfaces.md "Version history"): ⌘⌥⇧H opens the mode over the whole window on the current version; a named
// version is listed, and chosen it is drawn read only as it stood, what it added in its editor's colour; Back leaves.

const BODY = '[role="textbox"][aria-label="Document body"]';
const AT_VERSION = '[role="textbox"][aria-label="Document body at this version"]';
const READY = '[data-text-document-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test.use({ colorScheme: 'dark' });

async function saved(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-save-status]').first()).toHaveAttribute(
    'data-save-status',
    'saved',
  );
}

test('opens the version history, draws a named version read only, and goes back', async ({
  page,
  pageErrors,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('First draft.');
  await saved(page);

  // A version of now, named through the api (the dialog that names one comes with the rest of the mode).
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const stored = (await (
    await page.request.get(`${apiBase}/documents/${id}`, { headers })
  ).json()) as { document: { tabs: { id: string }[] } };
  const tabId = stored.document.tabs[0]!.id;
  const named = await page.request.post(
    `${apiBase}/documents/${id}/text-documents/${tabId}/versions`,
    { headers, data: { name: 'Draft one' } },
  );
  expect(named.status()).toBe(200);

  await page.locator(BODY).press('End');
  await page.keyboard.type(' Second thoughts.');
  await saved(page);

  // ⌘⌥⇧H (Ctrl+Alt+Shift+H here).
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('Shift+H');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  const mode = page.getByRole('dialog', { name: 'Version history' });
  await expect(mode).toBeVisible();
  await expect(mode.getByRole('heading', { level: 1 })).toHaveText('Current version');
  await expect(mode.locator(AT_VERSION)).toHaveText('First draft. Second thoughts.');
  await expect(mode.locator(AT_VERSION)).toHaveAttribute('aria-readonly', 'true');

  const list = mode.getByRole('listbox', { name: 'Versions' });
  await expect(list).toBeFocused();
  await expect(list.getByRole('group', { name: 'Today' })).toContainText('Draft one');
  await list.press('ArrowDown');
  await expect(mode.getByRole('heading', { level: 1 })).toHaveText('Draft one');
  await expect(mode.locator(AT_VERSION)).toHaveText('First draft.');
  await expect(mode.locator(`${AT_VERSION} [data-ychange="added"]`).first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('version-history.png') });

  // Typing does nothing at a version.
  await mode.locator(AT_VERSION).click();
  await page.keyboard.type('zzz');
  await expect(mode.locator(AT_VERSION)).toHaveText('First draft.');

  await mode.getByRole('button', { name: 'Back' }).click();
  await expect(mode).toHaveCount(0);
  await expect(page.locator(BODY)).toHaveText('First draft. Second thoughts.');
  expectNoPageErrors(pageErrors);
});

test('dims See version history in This Browser, saying why', async ({ page }) => {
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
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'File' })
    .click();
  await page.getByRole('menuitem', { name: 'Version history', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^See version history/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});
