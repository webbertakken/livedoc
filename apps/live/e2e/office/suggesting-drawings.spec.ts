import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Drawings while suggesting (docs/specs/034-text-documents/review.md "Drawings"): opening a drawing's picture opens a
// copy; Save and close suggests its replacement ("Replace: Drawing"), the old picture struck through beside the new;
// Reject takes the new picture and its drawing tab away, Accept the old ones; Save and close unchanged suggests
// nothing; Insert > Drawing > New while suggesting is "Add: Drawing". No drawing tab is left behind.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const CARD = '[data-suggestion-card]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test.use({ colorScheme: 'dark' });

async function suggesting(page: Page) {
  // ⌘⌥⇧X (Ctrl+Alt+Shift+X here) switches to Suggesting.
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();
}

/** A square drawn at (x, 430) in the open drawing, then Save and close. */
async function drawSquareAndClose(page: Page, x: number | null) {
  const bar = page.getByRole('region', { name: 'Drawing', exact: true });
  await expect(bar).toContainText('Drawing in');
  if (x !== null) {
    await page.keyboard.press('r');
    await page.mouse.click(x, 430);
    await page.keyboard.press('Escape');
  }
  await bar.getByRole('button', { name: 'Save and close' }).click();
  await expect(page.locator(READY)).toBeVisible();
}

async function settle(page: Page, line: string, verb: 'Accept' | 'Reject') {
  const card = page.locator(CARD).filter({ hasText: line });
  await card.click();
  await card.getByRole('button', { name: `${verb} suggestion` }).click();
  await expect(card).toHaveCount(0);
}

test('a drawing changed while suggesting is a replacement on a copy, settled with no tab left behind', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Before ');
  await (await officeMenuItem(page, ['Insert', 'Drawing', 'New'])).click();
  await drawSquareAndClose(page, 640);
  const pictures = body.locator('.text-document-picture');
  await expect(pictures).toHaveCount(1);
  const shapes = (at: number) => pictures.nth(at).locator('[data-drawing-svg] > svg > g');
  await expect(shapes(0)).toHaveCount(1);

  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const drawingTabs = async () => {
    const response = await page.request.get(`${apiBase}/documents/${id}`, { headers });
    const json = (await response.json()) as { document: { tabs: { drawingOf?: string | null }[] } };
    return json.document.tabs.filter((tab) => tab.drawingOf).length;
  };
  await expect.poll(drawingTabs, { timeout: 15_000 }).toBe(1);
  await suggesting(page);

  // Changed on a copy: the old picture struck through, the new one beside it, one card.
  await pictures.first().dblclick();
  await drawSquareAndClose(page, 820);
  await expect(pictures).toHaveCount(2);
  await expect(page.locator(CARD).filter({ hasText: 'Replace: Drawing' })).toHaveCount(1);
  await expect(shapes(0)).toHaveCount(1);
  await expect(shapes(1)).toHaveCount(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggesting-drawing-replacement.png') });

  // Rejected: the drawing as it was, the copy's tab gone.
  await settle(page, 'Replace: Drawing', 'Reject');
  await expect(pictures).toHaveCount(1);
  await expect(shapes(0)).toHaveCount(1);
  await expect.poll(drawingTabs, { timeout: 15_000 }).toBe(1);

  // Unchanged: nothing suggested, the copy removed.
  await pictures.first().dblclick();
  await drawSquareAndClose(page, null);
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(pictures).toHaveCount(1);
  await expect.poll(drawingTabs, { timeout: 15_000 }).toBe(1);

  // Accepted: the new drawing alone, the old one's tab gone.
  await pictures.first().dblclick();
  await drawSquareAndClose(page, 820);
  await settle(page, 'Replace: Drawing', 'Accept');
  await expect(pictures).toHaveCount(1);
  await expect(shapes(0)).toHaveCount(2);
  await expect.poll(drawingTabs, { timeout: 15_000 }).toBe(1);

  // A new drawing put in while suggesting.
  await body.locator('p').first().click();
  await page.keyboard.press('Home');
  await (await officeMenuItem(page, ['Insert', 'Drawing', 'New'])).click();
  await drawSquareAndClose(page, 640);
  await expect(page.locator(CARD).filter({ hasText: 'Add: Drawing' })).toHaveCount(1);
  await expect(pictures).toHaveCount(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggesting-drawing-new.png') });
  await settle(page, 'Add: Drawing', 'Reject');
  await expect(pictures).toHaveCount(1);
  await expect.poll(drawingTabs, { timeout: 15_000 }).toBe(1);
  expectNoPageErrors(pageErrors);
});
