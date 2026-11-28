import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// File > Make a copy (docs/specs/034-text-documents/files-and-print.md "Make a copy"): the Copy document dialog names
// the copy "Copy of ‹name›", files it in a folder of the person's own, leaves comments and suggestions out unless
// asked, and opens the copy in a new browser tab.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const CARD = '[data-thread-card]:not([data-thread-card="draft"])';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test.use({ colorScheme: 'dark' });

async function copyFrom(page: Page, comments: boolean): Promise<Page> {
  await (await officeMenuItem(page, ['File', 'Make a copy'])).click();
  const dialog = page.getByRole('dialog', { name: 'Copy document' });
  await expect(dialog).toBeVisible();
  if (comments)
    await dialog.getByRole('checkbox', { name: 'Copy comments and suggestions' }).check();
  const [copy] = await Promise.all([
    page.context().waitForEvent('page'),
    dialog.getByRole('button', { name: 'Make a copy' }).click(),
  ]);
  await expect(dialog).toHaveCount(0);
  await copy.setViewportSize({ width: 1280, height: 800 });
  await copy.waitForURL(/\/document\//);
  await expect(copy.locator(READY)).toBeVisible({ timeout: 30_000 });
  return copy;
}

test('Make a copy files the copy where chosen, without comments unless asked, in a new tab', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('The quarterly results are in.');
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 17; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await (await officeMenuItem(page, ['Insert', 'Comment'])).click();
  const draft = page.getByRole('group', { name: 'New comment' });
  await expect(draft.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await page.keyboard.type('Is this final?');
  await draft.getByRole('button', { name: 'Comment' }).click();
  await expect(page.locator(CARD)).toHaveCount(1);

  // A folder of the person's own, there when the page is next read.
  const origin = new URL(baseURL!).origin;
  const headers = await pageOwnerHeaders(page, {
    Origin: origin,
    'Content-Type': 'application/json',
  });
  const folderId = crypto.randomUUID();
  const made = await page.request.post(`${apiBase}/folders`, {
    headers,
    data: { id: folderId, name: 'Copies' },
  });
  expect(made.ok(), `seeding a folder failed: ${made.status()}`).toBe(true);
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.locator(CARD)).toHaveCount(1);
  const name = (await page.getByRole('textbox', { name: 'Rename' }).inputValue()).trim();

  // The dialog: the name selected, My Documents, the review choices; Change picks the folder.
  await (await officeMenuItem(page, ['File', 'Make a copy'])).click();
  const dialog = page.getByRole('dialog', { name: 'Copy document' });
  const field = dialog.getByRole('textbox', { name: 'Name' });
  await expect(field).toHaveValue(`Copy of ${name}`);
  await expect(field).toBeFocused();
  await expect(dialog.locator('[data-office-copy-folder]')).toContainText('My Documents');
  await dialog.getByRole('checkbox', { name: 'Copy comments and suggestions' }).check();
  await expect(
    dialog.getByRole('checkbox', { name: 'Include resolved comments and suggestions' }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('copy-dialog.png') });
  await dialog.getByRole('checkbox', { name: 'Copy comments and suggestions' }).uncheck();
  await dialog.getByRole('button', { name: /^Change folder/ }).click();
  const picker = page.getByRole('dialog', { name: 'Copy to folder' });
  await picker.getByRole('radio', { name: /^My Documents/ }).click();
  await picker.getByRole('radio', { name: /^Copies/ }).click();
  await picker.getByRole('button', { name: 'Choose' }).click();
  await expect(dialog.locator('[data-office-copy-folder]')).toContainText('Copies');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  // Without comments: the writing comes, the thread does not.
  const plain = await copyFrom(page, false);
  await expect(plain.locator(BODY)).toContainText('The quarterly results are in.');
  await expect(plain.locator(CARD)).toHaveCount(0);
  await expect(plain.getByRole('textbox', { name: 'Rename' })).toHaveValue(`Copy of ${name}`);
  await plain.screenshot({ path: test.info().outputPath('copy-without-comments.png') });
  await plain.close();

  // With comments: the thread comes too.
  const reviewed = await copyFrom(page, true);
  await expect(reviewed.locator(CARD).getByText('Is this final?')).toBeVisible();
  await reviewed.screenshot({ path: test.info().outputPath('copy-with-comments.png') });
  await reviewed.close();

  expectNoPageErrors(pageErrors);
});

test('Make a copy files the copy in the folder picked', async ({ page, baseURL, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const origin = new URL(baseURL!).origin;
  const headers = await pageOwnerHeaders(page, {
    Origin: origin,
    'Content-Type': 'application/json',
  });
  const folderId = crypto.randomUUID();
  const made = await page.request.post(`${apiBase}/folders`, {
    headers,
    data: { id: folderId, name: 'Copies' },
  });
  expect(made.ok()).toBe(true);
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();

  await (await officeMenuItem(page, ['File', 'Make a copy'])).click();
  const dialog = page.getByRole('dialog', { name: 'Copy document' });
  await dialog.getByRole('button', { name: /^Change folder/ }).click();
  const picker = page.getByRole('dialog', { name: 'Copy to folder' });
  await picker.getByRole('radio', { name: /^My Documents/ }).click();
  await picker.getByRole('radio', { name: /^Copies/ }).click();
  await picker.getByRole('button', { name: 'Choose' }).click();
  const [copy] = await Promise.all([
    page.context().waitForEvent('page'),
    dialog.getByRole('button', { name: 'Make a copy' }).click(),
  ]);
  await copy.waitForURL(/\/document\//);
  const copyId = new URL(copy.url()).pathname.split('/')[2]!;
  const listed = await page.request.get(`${apiBase}/documents`, { headers });
  const { documents } = (await listed.json()) as {
    documents: { id: string; folderId: string | null }[];
  };
  expect(documents.find((d) => d.id === copyId)?.folderId).toBe(folderId);
  await copy.close();
  expectNoPageErrors(pageErrors);
});

// Share it with the same people: the owner's copy gets a new link for each of the source's, never its code.
test('Make a copy shares the owner’s copy with the same people when ticked', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const sourceId = new URL(page.url()).pathname.split('/')[2]!;
  const origin = new URL(baseURL!).origin;
  const headers = await pageOwnerHeaders(page, {
    Origin: origin,
    'Content-Type': 'application/json',
  });
  const minted = await page.request.post(`${apiBase}/documents/${sourceId}/share`, {
    headers,
    data: { role: 'edit', expiry: 'week' },
  });
  expect(minted.ok(), `minting a link failed: ${minted.status()}`).toBe(true);
  const { code: sourceCode } = (await minted.json()) as { code: string };

  await (await officeMenuItem(page, ['File', 'Make a copy'])).click();
  const dialog = page.getByRole('dialog', { name: 'Copy document' });
  const share = dialog.getByRole('checkbox', { name: 'Share it with the same people' });
  await expect(share).not.toBeChecked();
  await share.check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('copy-share-same-people.png') });
  const [copy] = await Promise.all([
    page.context().waitForEvent('page'),
    dialog.getByRole('button', { name: 'Make a copy' }).click(),
  ]);
  await copy.waitForURL(/\/document\//);
  const copyId = new URL(copy.url()).pathname.split('/')[2]!;
  const listed = await page.request.get(`${apiBase}/documents/${copyId}/share`, { headers });
  expect(listed.ok()).toBe(true);
  const { links } = (await listed.json()) as {
    links: { code: string; role: string; expiry: string }[];
  };
  expect(links.map((l) => [l.role, l.expiry])).toEqual([['edit', 'week']]);
  expect(links[0]!.code).not.toBe(sourceCode);
  await copy.close();
  expectNoPageErrors(pageErrors);
});
