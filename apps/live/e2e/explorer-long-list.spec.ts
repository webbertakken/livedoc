import type { Page } from '@playwright/test';
import { apiBase, darkVisitor } from './audit-screens';
import { expect, expectNoPageErrors, mintSignedGuest, ownerHeaders, test } from './fixtures';

// A long folder (docs/specs/013-workspace/explorer-structure.md "Long lists"): only the rows near the view are drawn,
// each saying its place; Ctrl F finds a row not drawn; scrolling reaches the end; Back lands on the row it left.

const COUNT = 120;
const name = (i: number) => `Sprint ${String(i + 1).padStart(3, '0')}`;

async function seedLongFolder(page: Page, owner: string, origin: string): Promise<void> {
  const headers = ownerHeaders(owner, { Origin: origin, 'Content-Type': 'application/json' });
  const folderId = crypto.randomUUID();
  const folder = await page.request.post(`${apiBase}/folders`, {
    headers,
    data: { id: folderId, name: 'Archive' },
  });
  expect(folder.ok(), `seeding the folder failed: ${folder.status()}`).toBe(true);
  const now = Date.now();
  for (let start = 0; start < COUNT; start += 12) {
    await Promise.all(
      Array.from({ length: Math.min(12, COUNT - start) }, async (_, k) => {
        const i = start + k;
        const res = await page.request.post(`${apiBase}/documents`, {
          headers,
          data: {
            id: crypto.randomUUID(),
            name: name(i),
            folderId,
            tabs: [],
            createdAt: now - i * 60_000 - 1000,
            savedAt: now - i * 60_000,
            markUsed: false,
          },
        });
        expect(res.ok(), `seeding ${name(i)} failed: ${res.status()}`).toBe(true);
      }),
    );
  }
}

test('a long folder draws its rows as they come into view, finds any, and Back lands where it was', async ({
  page,
  pageErrors,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const owner = await mintSignedGuest(page.request);
  await darkVisitor(page, owner);
  await page.addInitScript(() => localStorage.setItem('livedoc:explorer-view', 'list'));
  await seedLongFolder(page, owner, new URL(baseURL!).origin);

  await page.goto('/explorer/all');
  await page.getByRole('treeitem', { name: 'Archive' }).click();
  const first = page.getByRole('listitem').filter({ hasText: name(0) });
  await expect(first).toHaveAttribute('aria-posinset', '1');
  await expect(first).toHaveAttribute('aria-setsize', String(COUNT));
  expect(await page.locator('li[aria-posinset]').count()).toBeLessThan(COUNT);
  await expect(page.getByText(name(COUNT - 3), { exact: true })).toHaveCount(0);

  // Ctrl F: the Explorer's search, which finds a row that is not drawn.
  await page.keyboard.press('Control+f');
  const search = page.getByPlaceholder('Search or filter documents');
  await expect(search).toBeFocused();
  await page.keyboard.type(name(COUNT - 3));
  await expect(page.getByRole('link', { name: name(COUNT - 3) }).first()).toBeVisible();
  await search.fill('');
  await expect(first).toHaveAttribute('aria-setsize', String(COUNT));

  // Scrolling to the end draws the last row.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = page.getByRole('listitem').filter({ hasText: name(COUNT - 1) });
  await expect(last).toBeInViewport();
  await expect(last).toHaveAttribute('aria-posinset', String(COUNT));

  // Back from a document opened far down lands on its row again.
  const far = page.getByRole('link', { name: name(COUNT - 2), exact: true }).first();
  const top = (await far.boundingBox())!.y;
  await far.click();
  await page.waitForURL(/\/document\//);
  await page.goBack();
  const again = page.getByRole('link', { name: name(COUNT - 2), exact: true }).first();
  await expect(again).toBeInViewport();
  await expect
    .poll(async () => Math.abs(Math.round((await again.boundingBox())!.y - top)))
    .toBeLessThanOrEqual(2);
  expectNoPageErrors(pageErrors);
});
