import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// Custom stamps end to end (docs/specs/035-pdf-documents/custom-stamps.md "Making one": Insert > Stamp > Custom stamps
// opens Create custom stamp, a PNG chosen, named by its file, in Custom; Create makes it the stamp shown, the tool in
// hand; "Placing one": a press places it, the page draws its picture; the grid shows it under its category, then
// Create custom stamp…; "In the file": a Stamp named `#` and its id, its picture an image; "Managing them": renamed and
// deleted in Manage stamps, the stamp placed staying).

async function pressAt(page: Page, first: Locator, [x, y]: [number, number]) {
  const box = (await first.boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

/** A PNG drawn by the browser: a green box with a word, 240 by 120 pixels. */
async function picture(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 120;
    const context = canvas.getContext('2d')!;
    context.strokeStyle = '#2e7d32';
    context.lineWidth = 8;
    context.strokeRect(4, 4, 232, 112);
    context.fillStyle = '#2e7d32';
    context.font = 'bold 48px sans-serif';
    context.fillText('PAID', 62, 78);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  return Buffer.from(bytes);
}

test('a picture is made a custom stamp, placed, and leaves as a Stamp with its picture', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Invoice.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);

  // Insert > Stamp > Custom stamps opens Create custom stamp; Create waits for a picture.
  await (await officeMenuItem(page, ['Insert', 'Stamp', 'Custom stamps'])).click();
  const dialog = page.getByRole('dialog', { name: 'Create custom stamp' });
  await expect(dialog).toBeVisible();
  const create = dialog.getByRole('button', { name: 'Create', exact: true });
  await expect(create).toBeDisabled();

  // A PNG chosen: its preview as kept, named by its file, in Custom.
  await dialog.getByLabel('Picture').setInputFiles({
    name: 'Paid.png',
    mimeType: 'image/png',
    buffer: await picture(page),
  });
  await expect(
    dialog.getByRole('img', { name: 'The stamp’s picture as it will be kept' }),
  ).toBeVisible();
  await expect(dialog.getByLabel('Name')).toHaveValue('Paid');
  await expect(dialog.getByLabel('Category')).toHaveValue('Custom');
  // Settled after its fade in, so the picture shows it as a person sees it.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  await page.screenshot({ path: test.info().outputPath('pdf-custom-stamp-dialog.png') });

  // Create makes it the stamp shown, the Stamp tool in hand.
  await create.click();
  await expect(dialog).toBeHidden();
  const control = page.getByRole('button', { name: 'Stamp: Paid', exact: true });
  await expect(control).toHaveAttribute('aria-pressed', 'true');

  // A press places it; the page draws its picture.
  await pressAt(page, first, [0.3, 0.15]);
  const stamp = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="stamp"]`);
  await expect(stamp).toHaveCount(1);
  await expect(stamp.locator('[data-pdf-stamp-picture]')).toHaveCount(1);

  // The grid shows it under its category, after Standard and Dynamic, then Create custom stamp….
  await page.getByRole('button', { name: 'Stamp: Paid styles' }).click();
  const menu = page.getByRole('menu', { name: 'Stamp: Paid styles' });
  await expect(menu.getByRole('group', { name: 'Custom' })).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Paid' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(menu.getByRole('menuitem', { name: 'Create custom stamp…' })).toBeVisible();
  await expect(menu).toHaveCSS('opacity', '1');
  await menu.getByRole('group', { name: 'Custom' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('pdf-custom-stamp-grid.png') });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: test.info().outputPath('pdf-custom-stamp-placed.png') });

  // Downloaded: a Stamp named # and its id, its appearance an image, a valid file.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-custom-stamps-')), 'Invoice.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  expect(added).toMatch(/\/Name \/#23custom-|\/Name \/#custom-/);
  expect(added).toContain('/Subtype /Image');
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });

  // Manage stamps: renamed once left, the control saying the new name; deleted after asking, the placed stamp staying.
  await (await officeMenuItem(page, ['Insert', 'Stamp', 'Manage stamps'])).click();
  const manage = page.getByRole('dialog', { name: 'Manage stamps' });
  await expect(manage.getByRole('region', { name: 'Custom' })).toBeVisible();
  const name = manage.getByLabel('Name of Paid');
  await name.fill('Settled');
  await name.press('Enter');
  await expect(page.getByRole('button', { name: 'Stamp: Settled', exact: true })).toBeVisible();
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  await page.screenshot({ path: test.info().outputPath('pdf-manage-stamps.png') });
  await manage.getByRole('button', { name: 'Delete Settled' }).click();
  await expect(manage.getByText('Delete Settled? Stamps already placed stay.')).toBeVisible();
  await manage.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(manage.getByText('You have no custom stamps yet.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(manage).toBeHidden();
  await expect(page.getByRole('button', { name: 'Stamp: Approved', exact: true })).toBeVisible();
  await expect(stamp.locator('[data-pdf-stamp-picture]')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});

// custom-stamps.md "Making one": Show who and when; "Placing one": its picture with who and when under it; "In the
// file": the lines set as text in its appearance, and its Contents.
test('a custom stamp that shows who and when is placed with them and leaves with them', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Received.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);

  // Create custom stamp, Show who and when checked.
  await (await officeMenuItem(page, ['Insert', 'Stamp', 'Custom stamps'])).click();
  const dialog = page.getByRole('dialog', { name: 'Create custom stamp' });
  await dialog.getByLabel('Picture').setInputFiles({
    name: 'Received.png',
    mimeType: 'image/png',
    buffer: await picture(page),
  });
  const check = dialog.getByRole('checkbox', { name: 'Show who and when' });
  await expect(check).not.toBeChecked();
  await check.check();
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  await page.screenshot({ path: test.info().outputPath('pdf-custom-dynamic-dialog.png') });
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog).toBeHidden();

  // Placed: its picture, and under it "by" the placer and the time.
  await pressAt(page, first, [0.3, 0.15]);
  const stamp = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="stamp"]`);
  await expect(stamp.locator('[data-pdf-stamp-picture]')).toHaveCount(1);
  await expect(stamp.locator('text')).toHaveText([
    /^by .+, \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/,
  ]);
  await page.screenshot({ path: test.info().outputPath('pdf-custom-dynamic-placed.png') });

  // Downloaded: who and when set as text under the picture, in a valid file.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const folder = mkdtempSync(join(tmpdir(), 'pdf-custom-dynamic-'));
  const file = join(folder, 'Received.pdf');
  await download.saveAs(file);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  const plain = join(folder, 'plain.pdf');
  execFileSync('qpdf', ['--qdf', '--object-streams=disable', file, plain], { stdio: 'pipe' });
  const text = readFileSync(plain).toString('latin1');
  expect(text).toMatch(/\/Im0 Do Q/);
  expect(text).toMatch(/\(by [^)]+, \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}\) Tj/);
  expectNoPageErrors(pageErrors);
});
