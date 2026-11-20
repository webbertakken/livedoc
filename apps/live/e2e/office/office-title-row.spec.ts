import type { Browser, Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// The office title row on a text document (docs/specs/034-text-documents/editing-surface.md "The title row";
// docs/specs/004-interface-design/office-shell.md "Title row"): the owner renames in place, stars, finds Share and
// Move; a visitor who may not share sees Make a copy; each sees the other among the people here and follows their caret.

const BODY = '[role="textbox"][aria-label="Document body"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

async function visitorOn(browser: Browser, baseURL: string, code: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1280, height: 860 },
  });
  const page = await ctx.newPage();
  await page.goto(`/document/shared?s=${code}`);
  const join = page.getByRole('button', { name: /^join$/i });
  await expect(join.or(page.locator(BODY))).toBeVisible();
  if (await join.isVisible()) await join.click();
  return page;
}

test('the title row renames, stars, shares, and shows the people here', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const row = page.getByRole('banner').filter({ has: page.getByRole('menubar') });

  // The mark goes to the Explorer; the name renames in place, an empty one is refused.
  await expect(row.getByRole('link', { name: 'Explorer' })).toBeVisible();
  const name = row.getByRole('textbox', { name: 'Rename' });
  await name.fill('');
  await name.press('Enter');
  await expect(row.getByRole('alert')).toHaveText('Give the document a name');
  await expect(name).toHaveValue('Untitled document');
  await name.fill('Field trip');
  await name.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Field trip');

  // Star, then Share and Move for the owner; the bottom line keeps no people over a text document.
  await row.getByRole('button', { name: 'Star' }).click();
  await expect(row.getByRole('button', { name: 'Starred' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(row.getByRole('button', { name: 'Share' })).toBeVisible();
  await row.getByRole('button', { name: 'Move' }).click();
  await expect(page.getByRole('dialog', { name: /Move/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Move/ })).toBeHidden();

  await page.locator(BODY).click();
  await page.keyboard.type('Bring a packed lunch.');
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'edit' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  // Shared behind the editor's back, by the api: the owner's editor learns it on a reload.
  await page.reload();
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const visitor = await visitorOn(browser, baseURL!, code);
  await expect(visitor.locator(BODY)).toHaveText('Bring a packed lunch.');

  // The visitor, an Editor by the link, may rename but not share: Make a copy stands in Share's place.
  const visitorRow = visitor.getByRole('banner').filter({ has: visitor.getByRole('menubar') });
  await expect(visitorRow.getByRole('button', { name: 'Make a copy' })).toBeVisible();
  await expect(visitorRow.getByRole('button', { name: 'Share' })).toHaveCount(0);
  await expect(visitorRow.getByRole('textbox', { name: 'Rename' })).toHaveValue('Field trip');

  // Each sees the other here; the owner's press follows the visitor's caret.
  await visitor.locator(BODY).click();
  await visitor.keyboard.press('End');
  await expect(row.getByRole('group', { name: 'People here' }).getByRole('button')).toHaveCount(1);
  await expect(page.locator('[data-contributors]')).toHaveCount(0);
  await row.getByRole('group', { name: 'People here' }).getByRole('button').click();
  await expect(page.locator('.text-document-peer-caret')).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('title-row.png') });
  await visitor.screenshot({ path: test.info().outputPath('title-row-visitor.png') });

  expectNoPageErrors(pageErrors);
});
