import { layersPdf, outlinePdf } from '@livedoc/pdf-documents/testing';
import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, pageOneDrawn, tapReaches } from './pdf-document-pages';

// "Phone and tablet": on a touch screen every target of a PDF's surface is at least 44 px (touch-targets.md); a
// packed row's controls reach 44 px down and their own width across, never less than WCAG 2.5.8's 24 px.

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

const TARGET_PX = 44;
const PACKED_PX = 24;

async function expectReach(page: Page, where: string) {
  const short = (await tapReaches(page)).filter(
    (reach) => reach.down < TARGET_PX || reach.across < PACKED_PX,
  );
  expect.soft(short, where).toEqual([]);
}

async function openPanel(page: Page, name: string) {
  await page.locator('[data-region="header"]').getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitemcheckbox', { name }).click();
}

async function opened(page: Page, name: string, bytes: Uint8Array) {
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, name, bytes);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  await pageOneDrawn(page);
}

test('every control of a PDF’s surface reaches 44 px under a finger', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await opened(page, 'Outline.pdf', outlinePdf());
  await expectReach(page, 'the surface');

  await page
    .getByRole('toolbar', { name: 'Toolbar' })
    .getByRole('button', { name: 'Find' })
    .click();
  await expect(page.getByRole('search', { name: 'Find in this PDF' })).toBeVisible();
  await expectReach(page, 'Find');
  await page.screenshot({ path: test.info().outputPath('pdf-targets-find.png') });
  await page.keyboard.press('Escape');

  await openPanel(page, 'Outline');
  await expect(page.getByRole('tree', { name: 'Bookmarks' })).toBeVisible();
  await expectReach(page, 'Outline');

  await openPanel(page, 'Thumbnails');
  await expectReach(page, 'Thumbnails');
  expectNoPageErrors(pageErrors);
});

test('the layers panel’s controls reach 44 px under a finger', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await opened(page, 'Layers.pdf', layersPdf());
  await openPanel(page, 'Layers');
  await expect(page.getByRole('list', { name: 'Layers' })).toBeVisible();
  await expectReach(page, 'Layers');
  await page.screenshot({ path: test.info().outputPath('pdf-targets-layers.png') });
  expectNoPageErrors(pageErrors);
});
