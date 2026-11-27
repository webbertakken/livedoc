import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { seedOfflineDocuments } from '../offline-seed';
import { officeMenuItem } from './office-menus';

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

test('names the current version, renames one in place, and restores it', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('First draft.');
  await saved(page);

  // File > Version history > Name current version.
  await (await officeMenuItem(page, ['File', 'Version history', 'Name current version'])).click();
  const naming = page.getByRole('dialog', { name: 'Name current version' });
  await expect(naming.getByRole('button', { name: 'Save' })).toBeDisabled();
  await naming.getByRole('textbox', { name: 'Version name' }).fill('Draft one');
  await naming.getByRole('button', { name: 'Save' }).click();
  await expect(naming).toHaveCount(0);

  await page.locator(BODY).click();
  await page.locator(BODY).press('End');
  await page.keyboard.type(' Second thoughts.');
  await saved(page);

  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('Shift+H');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  const mode = page.getByRole('dialog', { name: 'Version history' });
  const list = mode.getByRole('listbox', { name: 'Versions' });
  await expect(list).toBeFocused();
  await mode.getByRole('switch', { name: 'Only show named versions' }).click();
  await expect(list.getByRole('option')).toHaveCount(2);
  await list.focus();
  await list.press('ArrowDown');
  await expect(mode.getByRole('heading', { level: 1 })).toHaveText('Draft one');
  await expect(mode.getByRole('checkbox', { name: 'Show changes' })).toBeChecked();

  // Rename in place from the row's menu.
  await list.press('Shift+F10');
  await expect(page.getByRole('menu', { name: 'Actions for Draft one' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('version-menu.png') });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const field = mode.getByRole('textbox', { name: 'Version name' });
  await field.fill('Draft 1');
  await field.press('Enter');
  await expect(mode.getByRole('heading', { level: 1 })).toHaveText('Draft 1');

  // Restore it: asked once, then the document reads as it did and the mode closes.
  await list.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Restore this version' }).click();
  const restore = page.getByRole('dialog', { name: 'Restore this version?' });
  await page.screenshot({ path: test.info().outputPath('version-restore.png') });
  await restore.getByRole('button', { name: 'Restore' }).click();
  await expect(mode).toHaveCount(0);
  await expect(page.locator(BODY)).toHaveText('First draft.');
  expectNoPageErrors(pageErrors);
});

test('goes between a version’s changes with the keys, and makes a copy of it', async ({
  page,
  pageErrors,
  context,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('Kept words.');
  await saved(page);
  await (await officeMenuItem(page, ['File', 'Version history', 'Name current version'])).click();
  const naming = page.getByRole('dialog', { name: 'Name current version' });
  await naming.getByRole('textbox', { name: 'Version name' }).fill('Kept');
  await naming.getByRole('button', { name: 'Save' }).click();
  await expect(naming).toHaveCount(0);
  await page.locator(BODY).click();
  await page.locator(BODY).press('End');
  await page.keyboard.type(' Added later.');
  await saved(page);

  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('Shift+H');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  const mode = page.getByRole('dialog', { name: 'Version history' });
  const list = mode.getByRole('listbox', { name: 'Versions' });
  await expect(list).toBeFocused();
  // The versions read before the keys move through them.
  await expect(list.getByRole('option', { name: /^Kept/ })).toBeVisible();
  await list.press('ArrowDown');
  await expect(mode.locator(`${AT_VERSION} [data-ychange]`).first()).toBeVisible();

  // ⌘⌥ N then R (Ctrl+Alt+N, R here): the first change ringed and said.
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyN');
  await page.keyboard.press('KeyR');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(mode.locator('[data-version-change-current]')).toHaveCount(1);
  await expect(mode.getByRole('status')).toHaveText(/^Change 1 of \d+$/);

  // Make a copy: a new document holding the version, opened in a new tab.
  await list.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Make a copy' }).click();
  const copying = page.getByRole('dialog', { name: 'Copy document' });
  await expect(copying.getByRole('textbox', { name: 'Name' })).toHaveValue(/^Copy of /);
  await copying.getByRole('textbox', { name: 'Name' }).fill('Kept copy');
  await page.screenshot({ path: test.info().outputPath('version-copy.png') });
  const opened = context.waitForEvent('page');
  await copying.getByRole('button', { name: 'Make a copy' }).click();
  const copy = await opened;
  await expect(copy.locator(READY)).toBeVisible();
  await expect(copy.locator(BODY)).toHaveText('Kept words.');
  await expect(copy.getByRole('textbox', { name: 'Rename' })).toHaveValue('Kept copy');
  expectNoPageErrors(pageErrors);
});

test('opens version history from the last edit, and a restore keeps a collaborator’s later typing', async ({
  page,
  pageErrors,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Agreed text.');
  await saved(page);
  await (await officeMenuItem(page, ['File', 'Version history', 'Name current version'])).click();
  const naming = page.getByRole('dialog', { name: 'Name current version' });
  await naming.getByRole('textbox', { name: 'Version name' }).fill('Agreed');
  await naming.getByRole('button', { name: 'Save' }).click();
  await expect(naming).toHaveCount(0);
  await body.click();
  await body.press('End');
  await page.keyboard.type(' Draft idea.');
  await saved(page);

  // An Editor on a share link, typing in the document.
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'edit' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1440, height: 900 },
  });
  const peer = await ctx.newPage();
  await peer.goto(`/document/shared?s=${code}`);
  const join = peer.getByRole('button', { name: /^join$/i });
  await expect(join.or(peer.locator(READY))).toBeVisible({ timeout: 30_000 });
  if (await join.isVisible()) await join.click();
  await expect(peer.locator(READY)).toBeVisible();
  await expect(peer.locator(BODY)).toHaveText('Agreed text. Draft idea.');

  // The save status's details say the last edit, which opens the history.
  await page.locator('[data-save-status]').first().click();
  const lastEdit = page.getByRole('button', { name: /^Last edit was just now by / });
  await expect(lastEdit).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('last-edit.png') });
  await lastEdit.click();
  const mode = page.getByRole('dialog', { name: 'Version history' });
  const list = mode.getByRole('listbox', { name: 'Versions' });
  await expect(list.getByRole('option', { name: /^Agreed/ })).toBeVisible();
  await list.focus();
  await list.press('ArrowDown');
  await expect(mode.getByRole('heading', { level: 1 })).toHaveText('Agreed');

  // The collaborator keeps typing while the restore happens; their later words stay on top of it.
  await list.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Restore this version' }).click();
  await page
    .getByRole('dialog', { name: 'Restore this version?' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(mode).toHaveCount(0);
  await expect(body).toHaveText('Agreed text.');
  await expect(peer.locator(BODY)).toHaveText('Agreed text.');
  await peer.locator(BODY).click();
  await peer.locator(BODY).press('End');
  await peer.keyboard.type(' Later.');
  await expect(body).toHaveText('Agreed text. Later.');
  await ctx.close();
  expectNoPageErrors(pageErrors);
});
